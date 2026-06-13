"""Tests Module 9 — Détection de lacunes transversale (calcul réel)."""
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from school.models import (
    Eleves, Matieres, Epreuves, Questions, SessionsExamen, Reponses, Lacunes,
)
from school.lacune_engine import (
    detecter_lacunes_transversales, NOTION_AUTO, SEUIL_MIN_REPONSES,
)


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'lac_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Tabi', 'prenom': 'Eric', 'telephone': '+237699500010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


def _eleve():
    c = APIClient()
    register_and_auth(c, ELEVE)
    return Eleves.objects.get(email=ELEVE['email'])


def _matiere(code='MATH', nom='Mathématiques'):
    return Matieres.objects.create(code=code, nom=nom, niveaux=['Tle'])


def _session_avec_reponses(eleve, matiere, resultats, difficulte='moyen'):
    """Crée une épreuve + session terminée + réponses corrigées.

    `resultats` : liste de bool (True = bonne réponse)."""
    epreuve = Epreuves.objects.create(
        id_matiere=matiere, titre='E', type_epreuve='exercice', niveau='Tle')
    session = SessionsExamen.objects.create(
        id_eleve=eleve, id_epreuve=epreuve, statut='termine',
        date_fin=timezone.now(), nb_questions=len(resultats))
    for i, ok in enumerate(resultats, start=1):
        q = Questions.objects.create(
            id_epreuve=epreuve, numero_ordre=i, enonce=f"Q{i}",
            type_question='qcm', options=['A', 'B'], reponse_correcte='A',
            difficulte=difficulte)
        Reponses.objects.create(
            id_session=session, id_question=q,
            contenu_reponse='A' if ok else 'B', est_correcte=ok)
    return epreuve, session


@pytest.mark.django_db
class TestMoteurDetection:

    def test_detecte_lacune_si_taux_faible(self):
        eleve = _eleve()
        matiere = _matiere()
        # 1 bonne / 5 → 20 % → détectée
        _session_avec_reponses(eleve, matiere, [True, False, False, False, False])

        recap = detecter_lacunes_transversales(eleve)
        assert recap['detectees'] == 1
        lac = Lacunes.objects.get(id_eleve=eleve, id_matiere=matiere, notion=NOTION_AUTO)
        assert float(lac.taux_maitrise) == 20.0
        assert lac.statut == 'detectee'
        assert lac.nb_exercices_faits == 5

    def test_en_cours_si_taux_intermediaire(self):
        eleve = _eleve()
        matiere = _matiere()
        # 3 bonnes / 5 → 60 % → en cours
        _session_avec_reponses(eleve, matiere, [True, True, True, False, False])
        recap = detecter_lacunes_transversales(eleve)
        assert recap['en_cours'] == 1
        lac = Lacunes.objects.get(id_eleve=eleve, id_matiere=matiere, notion=NOTION_AUTO)
        assert lac.statut == 'en_cours'

    def test_maitrisee_horodatee_si_taux_eleve(self):
        eleve = _eleve()
        matiere = _matiere()
        # 5 bonnes / 5 → 100 % → maîtrisée
        _session_avec_reponses(eleve, matiere, [True, True, True, True, True])
        recap = detecter_lacunes_transversales(eleve)
        assert recap['maitrisees'] == 1
        lac = Lacunes.objects.get(id_eleve=eleve, id_matiere=matiere, notion=NOTION_AUTO)
        assert lac.statut == 'maitrisee'
        assert lac.date_maitrise is not None

    def test_pas_assez_de_donnees_ignore(self):
        eleve = _eleve()
        matiere = _matiere()
        _session_avec_reponses(eleve, matiere, [False] * (SEUIL_MIN_REPONSES - 1))
        recap = detecter_lacunes_transversales(eleve)
        assert recap['ignorees'] == 1
        assert not Lacunes.objects.filter(id_eleve=eleve).exists()

    def test_transversal_plusieurs_matieres(self):
        eleve = _eleve()
        maths = _matiere('MATH', 'Mathématiques')
        physique = _matiere('PHY', 'Physique')
        _session_avec_reponses(eleve, maths, [False, False, False, False, True])     # 20 %
        _session_avec_reponses(eleve, physique, [True, True, True, True, True])      # 100 %
        recap = detecter_lacunes_transversales(eleve)
        assert recap['detectees'] == 1
        assert recap['maitrisees'] == 1
        assert Lacunes.objects.filter(id_eleve=eleve).count() == 2

    def test_idempotent_pas_de_doublon(self):
        eleve = _eleve()
        matiere = _matiere()
        _session_avec_reponses(eleve, matiere, [True, False, False, False, False])
        detecter_lacunes_transversales(eleve)
        detecter_lacunes_transversales(eleve)
        assert Lacunes.objects.filter(
            id_eleve=eleve, id_matiere=matiere, notion=NOTION_AUTO).count() == 1

    def test_chapitre_reflete_difficulte_la_plus_faible(self):
        eleve = _eleve()
        matiere = _matiere()
        # Toutes les réponses ratées sont en « difficile ».
        _session_avec_reponses(eleve, matiere, [False, False, False, False], difficulte='difficile')
        detecter_lacunes_transversales(eleve)
        lac = Lacunes.objects.get(id_eleve=eleve, id_matiere=matiere, notion=NOTION_AUTO)
        assert lac.chapitre == 'Questions difficiles'


@pytest.mark.django_db
class TestEndpointEtIntegration:

    def test_endpoint_detecter(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        eleve = Eleves.objects.get(email=ELEVE['email'])
        matiere = _matiere()
        _session_avec_reponses(eleve, matiere, [True, False, False, False, False])

        res = c.post('/api/v1/analytique/lacunes/detecter/')
        assert res.status_code == 200
        assert res.data['recap']['detectees'] == 1
        assert len(res.data['lacunes']) == 1

    def test_endpoint_role_interdit(self):
        c = APIClient()
        register_and_auth(c, {
            'email': 'lac_prof@test.cm', 'password': 'TestPass123!',
            'nom': 'X', 'prenom': 'Y', 'telephone': '+237699500099',
            'role': 'enseignant',
        })
        res = c.post('/api/v1/analytique/lacunes/detecter/')
        assert res.status_code == 403

    def test_detection_auto_a_la_fin_de_session(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        eleve = Eleves.objects.get(email=ELEVE['email'])
        matiere = _matiere()

        # Une épreuve réelle avec 5 questions, démarrée puis répondue via l'API.
        epreuve = Epreuves.objects.create(
            id_matiere=matiere, titre='Eval', type_epreuve='exercice',
            niveau='Tle', statut='actif')
        questions = [
            Questions.objects.create(
                id_epreuve=epreuve, numero_ordre=i, enonce=f"Q{i}",
                type_question='qcm', options=['A', 'B'], reponse_correcte='A',
                difficulte='moyen')
            for i in range(1, 6)
        ]
        start = c.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {}, format='json')
        assert start.status_code == 201, start.data
        id_session = start.data['id_session']

        # 1 bonne réponse sur 5 → taux faible → lacune détectée.
        reponses = [{'id_question': str(questions[0].id_question), 'contenu_reponse': 'A'}]
        reponses += [{'id_question': str(q.id_question), 'contenu_reponse': 'B'} for q in questions[1:]]
        c.post(f'/api/v1/sessions/{id_session}/reponses/', {'reponses': reponses}, format='json')
        fin = c.post(f'/api/v1/sessions/{id_session}/terminer/', {}, format='json')

        assert fin.status_code == 200, fin.data
        assert fin.data['lacunes']['detectees'] == 1
        assert Lacunes.objects.filter(
            id_eleve=eleve, id_matiere=matiere, notion=NOTION_AUTO).exists()
