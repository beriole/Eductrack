"""Tests Module 11 — Micro-leçons ciblées."""
import json
import pytest
from rest_framework.test import APIClient

from school.models import (
    Eleves, Enseignants, Matieres, Lacunes, Cours, MicroLecons,
)
from school.api_views import lecon_views


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'lec_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Manga', 'prenom': 'Ines', 'telephone': '+237699600010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Littoral',
}
ENSEIGNANT = {
    'email': 'lec_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Bell', 'prenom': 'Marc', 'telephone': '+237699600011',
    'role': 'enseignant',
}

FAUSSE_LECON_IA = json.dumps({
    "titre": "Les limites de fonctions",
    "contenu": "Une limite décrit le comportement d'une fonction près d'un point. "
               "Par exemple, lim(x→0) sin(x)/x = 1. On utilise les théorèmes de "
               "comparaison et les opérations sur les limites pour les calculer.",
    "points_cles": ["Définition intuitive", "Limites usuelles", "Théorème des gendarmes"],
})


def _setup_eleve_et_lacune():
    c = APIClient()
    register_and_auth(c, ELEVE)
    eleve = Eleves.objects.get(email=ELEVE['email'])
    matiere = Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])
    lacune = Lacunes.objects.create(
        id_eleve=eleve, id_matiere=matiere, chapitre='Analyse',
        notion='Limites', taux_maitrise=30, statut='detectee')
    return c, eleve, matiere, lacune


@pytest.mark.django_db
class TestGenerationLecon:

    def test_authentification_requise(self):
        c = APIClient()
        res = c.post('/api/v1/lecons/generer/', {}, format='json')
        assert res.status_code == 401

    def test_enseignant_interdit(self):
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        res = c.post('/api/v1/lecons/generer/', {}, format='json')
        assert res.status_code == 403

    def test_params_manquants(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.post('/api/v1/lecons/generer/', {}, format='json')
        assert res.status_code == 400

    def test_generation_ia_persiste(self, monkeypatch):
        monkeypatch.setattr(lecon_views.ai_service, 'generate',
                            lambda *a, **k: FAUSSE_LECON_IA)
        c, eleve, matiere, lacune = _setup_eleve_et_lacune()
        res = c.post('/api/v1/lecons/generer/',
                     {'id_lacune': str(lacune.id_lacune)}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['source'] == 'ia'
        assert res.data['titre'] == "Les limites de fonctions"
        assert len(res.data['points_cles']) == 3
        assert res.data['notion'] == 'Limites'
        assert MicroLecons.objects.filter(id_eleve=eleve).count() == 1

    def test_fallback_methodologique_reel(self, monkeypatch):
        def ko(*a, **k):
            raise lecon_views.ai_service.AIUnavailable("pas de clé")
        monkeypatch.setattr(lecon_views.ai_service, 'generate', ko)

        c, eleve, matiere, lacune = _setup_eleve_et_lacune()
        # Un vrai cours publié sert de référence pour approfondir.
        prof = Enseignants.objects.create(
            email='p@x.cm', telephone='+237600000900', nom='P', prenom='Q',
            role='enseignant', specialite='Maths')
        cours = Cours.objects.create(
            id_enseignant=prof, id_matiere=matiere, titre='Cours sur les limites',
            contenu='Contenu réel du cours.', niveau='Tle', statut='publie')

        res = c.post('/api/v1/lecons/generer/',
                     {'id_lacune': str(lacune.id_lacune)}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['source'] == 'fallback'
        assert 'Limites' in res.data['titre']
        assert res.data['points_cles']  # fiche méthodo non vide
        assert str(cours.id_cours) == str(res.data['id_cours'])
        assert 'Cours sur les limites' in res.data['contenu']

    def test_generation_par_matiere_et_notion(self, monkeypatch):
        def ko(*a, **k):
            raise lecon_views.ai_service.AIUnavailable("x")
        monkeypatch.setattr(lecon_views.ai_service, 'generate', ko)
        c = APIClient()
        register_and_auth(c, ELEVE)
        matiere = Matieres.objects.create(code='PHY', nom='Physique', niveaux=['Tle'])
        res = c.post('/api/v1/lecons/generer/',
                     {'id_matiere': str(matiere.id_matiere), 'notion': 'Forces'},
                     format='json')
        assert res.status_code == 201
        assert 'Forces' in res.data['titre']
        assert res.data['id_lacune'] is None


@pytest.mark.django_db
class TestListeEtLecture:

    def test_liste_et_filtre_lue(self, monkeypatch):
        monkeypatch.setattr(lecon_views.ai_service, 'generate',
                            lambda *a, **k: FAUSSE_LECON_IA)
        c, eleve, matiere, lacune = _setup_eleve_et_lacune()
        gen = c.post('/api/v1/lecons/generer/',
                     {'id_lacune': str(lacune.id_lacune)}, format='json')
        id_lecon = gen.data['id_lecon']

        liste = c.get('/api/v1/lecons/')
        assert liste.status_code == 200
        assert liste.data['count'] == 1

        # Marquer lue puis filtrer.
        patch = c.patch(f'/api/v1/lecons/{id_lecon}/lue/')
        assert patch.status_code == 200
        assert patch.data['lue'] is True

        non_lues = c.get('/api/v1/lecons/', {'lue': 'false'})
        assert non_lues.data['count'] == 0
        lues = c.get('/api/v1/lecons/', {'lue': 'true'})
        assert lues.data['count'] == 1

    def test_lecon_d_un_autre_eleve_inaccessible(self, monkeypatch):
        monkeypatch.setattr(lecon_views.ai_service, 'generate',
                            lambda *a, **k: FAUSSE_LECON_IA)
        c, eleve, matiere, lacune = _setup_eleve_et_lacune()
        gen = c.post('/api/v1/lecons/generer/',
                     {'id_lacune': str(lacune.id_lacune)}, format='json')
        id_lecon = gen.data['id_lecon']

        autre = APIClient()
        register_and_auth(autre, {
            'email': 'lec_autre@test.cm', 'password': 'TestPass123!',
            'nom': 'Z', 'prenom': 'W', 'telephone': '+237699600077',
            'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
        })
        res = autre.patch(f'/api/v1/lecons/{id_lecon}/lue/')
        assert res.status_code == 404
