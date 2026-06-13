"""Tests — Micro-révisions quotidiennes."""
import datetime
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

import json

from school.models import (
    Eleves, Matieres, Epreuves, Questions, Lacunes, MicroRevisions, Notifications,
)
from school.api_views import revision_views
from school.api_views.revision_views import _serie_revisions

FAUSSES_QUESTIONS_IA = json.dumps([
    {"enonce": f"Question IA {i} ?", "options": ["A", "B", "C", "D"],
     "reponse_correcte": "A", "explication": "...", "difficulte": "moyen"}
    for i in range(1, 6)
])


@pytest.fixture(autouse=True)
def _ia_off_par_defaut(monkeypatch):
    """Par défaut, l'IA est indisponible dans ces tests (fallback banque),
    pour des résultats déterministes et sans appel réseau. Les tests qui
    veulent le chemin IA re-patchent `ai_service.chat`."""
    def ko(*a, **k):
        raise revision_views.ai_service.AIUnavailable("désactivée en test")
    monkeypatch.setattr(revision_views.ai_service, 'chat', ko)


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'rev_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Eto', 'prenom': 'Sam', 'telephone': '+237699900010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


def _client_eleve():
    c = APIClient()
    register_and_auth(c, ELEVE)
    return c, Eleves.objects.get(email=ELEVE['email'])


def _banque(nb=8, niveau='Tle'):
    matiere = Matieres.objects.create(code='MATH', nom='Maths', niveaux=[niveau])
    epreuve = Epreuves.objects.create(
        id_matiere=matiere, titre='Banque', type_epreuve='simulation', niveau=niveau, statut='actif')
    for i in range(1, nb + 1):
        Questions.objects.create(
            id_epreuve=epreuve, numero_ordre=i, enonce=f"Q{i} ?", type_question='qcm',
            options=['A', 'B', 'C', 'D'], reponse_correcte='A', difficulte='moyen')
    return matiere


@pytest.mark.django_db
class TestRevisionDuJour:

    def test_role_interdit(self):
        c = APIClient()
        register_and_auth(c, {
            'email': 'rev_prof@test.cm', 'password': 'TestPass123!', 'nom': 'X', 'prenom': 'Y',
            'telephone': '+237699900099', 'role': 'enseignant'})
        res = c.get('/api/v1/revisions/du-jour/')
        assert res.status_code == 403

    def test_du_jour_genere_par_ia(self, monkeypatch):
        monkeypatch.setattr(revision_views.ai_service, 'chat',
                            lambda *a, **k: FAUSSES_QUESTIONS_IA)
        c, eleve = _client_eleve()
        _banque(nb=8)  # une matière existe pour rattacher l'épreuve
        res = c.get('/api/v1/revisions/du-jour/')
        assert res.status_code == 200
        assert res.data['disponible'] is True
        assert res.data['source'] == 'ia'
        assert res.data['nb_questions'] == 5
        rev = MicroRevisions.objects.get(id_eleve=eleve)
        enonces = list(Questions.objects.filter(id_epreuve=rev.id_epreuve).values_list('enonce', flat=True))
        assert any('Question IA' in e for e in enonces)

    def test_du_jour_fallback_banque_si_ia_ko(self, monkeypatch):
        def ko(*a, **k):
            raise revision_views.ai_service.AIUnavailable("pas de clé")
        monkeypatch.setattr(revision_views.ai_service, 'chat', ko)
        c, eleve = _client_eleve()
        _banque(nb=8)
        res = c.get('/api/v1/revisions/du-jour/')
        assert res.status_code == 200
        assert res.data['disponible'] is True
        assert res.data['source'] == 'banque'
        assert res.data['nb_questions'] == 5

    def test_du_jour_idempotent(self):
        c, eleve = _client_eleve()
        _banque(nb=8)
        r1 = c.get('/api/v1/revisions/du-jour/')
        r2 = c.get('/api/v1/revisions/du-jour/')
        assert r1.data['id_epreuve'] == r2.data['id_epreuve']
        assert MicroRevisions.objects.filter(id_eleve=eleve).count() == 1

    def test_priorise_les_lacunes(self, monkeypatch):
        # On force le fallback banque pour tester la priorisation déterministe.
        def ko(*a, **k):
            raise revision_views.ai_service.AIUnavailable("forcé")
        monkeypatch.setattr(revision_views.ai_service, 'chat', ko)
        c, eleve = _client_eleve()
        # Matière faible (lacune) + matière neutre, chacune avec banque.
        faible = Matieres.objects.create(code='PHY', nom='Physique', niveaux=['Tle'])
        ep_faible = Epreuves.objects.create(
            id_matiere=faible, titre='B', type_epreuve='simulation', niveau='Tle', statut='actif')
        for i in range(1, 6):
            Questions.objects.create(
                id_epreuve=ep_faible, numero_ordre=i, enonce=f"PHY{i}", type_question='qcm',
                options=['A', 'B'], reponse_correcte='A', difficulte='moyen')
        _banque(nb=8)  # Maths, neutre
        Lacunes.objects.create(
            id_eleve=eleve, id_matiere=faible, chapitre='Méca', notion='Forces',
            taux_maitrise=20, statut='detectee')

        c.get('/api/v1/revisions/du-jour/')
        rev = MicroRevisions.objects.get(id_eleve=eleve)
        enonces = list(Questions.objects.filter(id_epreuve=rev.id_epreuve).values_list('enonce', flat=True))
        # Au moins une question de la matière en lacune (PHY).
        assert any(e.startswith('PHY') for e in enonces)

    def test_aucune_question_disponible(self):
        c, eleve = _client_eleve()  # pas de banque
        res = c.get('/api/v1/revisions/du-jour/')
        assert res.status_code == 200
        assert res.data['disponible'] is False


@pytest.mark.django_db
class TestCompletionEtSerie:

    def test_completer_marque_fait(self):
        c, eleve = _client_eleve()
        _banque(nb=8)
        c.get('/api/v1/revisions/du-jour/')
        res = c.post('/api/v1/revisions/du-jour/completer/', {'note': 16}, format='json')
        assert res.status_code == 200
        assert res.data['completee'] is True
        assert res.data['note'] == 16.0
        assert res.data['serie_revisions'] == 1

    def test_completer_sans_revision_404(self):
        c, eleve = _client_eleve()
        res = c.post('/api/v1/revisions/du-jour/completer/', {}, format='json')
        assert res.status_code == 404

    def test_serie_compte_jours_consecutifs(self):
        c, eleve = _client_eleve()
        today = timezone.localdate()
        for delta in (2, 1, 0):  # avant-hier, hier, aujourd'hui
            MicroRevisions.objects.create(
                id_eleve=eleve, date_jour=today - datetime.timedelta(days=delta),
                completee=True, date_completion=timezone.now())
        assert _serie_revisions(eleve, today) == 3

    def test_serie_rompue(self):
        c, eleve = _client_eleve()
        today = timezone.localdate()
        # Aujourd'hui + il y a 3 jours (trou hier et avant-hier).
        MicroRevisions.objects.create(
            id_eleve=eleve, date_jour=today, completee=True, date_completion=timezone.now())
        MicroRevisions.objects.create(
            id_eleve=eleve, date_jour=today - datetime.timedelta(days=3),
            completee=True, date_completion=timezone.now())
        assert _serie_revisions(eleve, today) == 1


@pytest.mark.django_db
class TestTacheNotification:

    def test_tache_genere_et_notifie(self):
        c, eleve = _client_eleve()  # AI indisponible → fallback banque
        _banque(nb=8)
        from school.tasks import envoyer_revisions_quotidiennes

        res = envoyer_revisions_quotidiennes()
        assert '1 rappel' in res
        # Une notification de rappel a été créée et la révision préparée.
        assert Notifications.objects.filter(id_utilisateur=eleve, type_notif='rappel').count() == 1
        rev = MicroRevisions.objects.get(id_eleve=eleve)
        assert rev.rappel_envoye is True
        assert rev.id_epreuve is not None

        # Deuxième passage le même jour : pas de doublon de notification.
        envoyer_revisions_quotidiennes()
        assert Notifications.objects.filter(id_utilisateur=eleve, type_notif='rappel').count() == 1

    def test_pas_de_notif_si_aucune_question(self):
        c, eleve = _client_eleve()  # pas de banque, pas d'IA
        from school.tasks import envoyer_revisions_quotidiennes
        res = envoyer_revisions_quotidiennes()
        assert '0 rappel' in res
        assert Notifications.objects.filter(id_utilisateur=eleve).count() == 0
