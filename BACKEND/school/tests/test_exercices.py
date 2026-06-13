"""Tests Module 2 — Génération d'exercices adaptatifs par l'IA."""
import json
import pytest
from rest_framework.test import APIClient

from school.models import Eleves, Matieres, Epreuves, Questions
from school.api_views import exercice_views


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'm2_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Ngono', 'prenom': 'Alice', 'telephone': '+237699300010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}
ENSEIGNANT = {
    'email': 'm2_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Mbarga', 'prenom': 'Jean', 'telephone': '+237699300011',
    'role': 'enseignant',
}

# Réponse IA simulée : 3 QCM bien formés.
FAUSSE_REPONSE_IA = json.dumps([
    {
        "enonce": "Quelle est la dérivée de x² ?",
        "options": ["2x", "x", "x²", "2"],
        "reponse_correcte": "2x",
        "explication": "La dérivée de x^n est n·x^(n-1).",
        "difficulte": "moyen",
    },
    {
        "enonce": "Combien font 7 × 8 ?",
        "options": ["54", "56", "48", "64"],
        "reponse_correcte": "56",
        "explication": "7 × 8 = 56.",
        "difficulte": "facile",
    },
    {
        "enonce": "Quelle est la primitive de 2x ?",
        "options": ["x²", "2", "x", "x³"],
        "reponse_correcte": "x²",
        "explication": "La primitive de 2x est x² (+ C).",
        "difficulte": "moyen",
    },
])


@pytest.mark.django_db
class TestExerciceGeneration:

    def _matiere(self):
        return Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])

    def test_authentification_requise(self):
        c = APIClient()
        res = c.post('/api/v1/exercices/generer/', {}, format='json')
        assert res.status_code == 401

    def test_enseignant_interdit(self):
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        res = c.post('/api/v1/exercices/generer/', {}, format='json')
        assert res.status_code == 403

    def test_matiere_ou_lacune_requise(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.post('/api/v1/exercices/generer/', {}, format='json')
        assert res.status_code == 400

    def test_generation_ia_cree_epreuve_et_questions(self, monkeypatch):
        monkeypatch.setattr(exercice_views.ai_service, 'chat',
                            lambda *a, **k: FAUSSE_REPONSE_IA)
        c = APIClient()
        register_and_auth(c, ELEVE)
        matiere = self._matiere()

        res = c.post('/api/v1/exercices/generer/',
                     {'id_matiere': str(matiere.id_matiere), 'difficulte': 'moyen',
                      'nb_questions': 3}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['source_generation'] == 'ia'
        assert res.data['type_epreuve'] == 'exercice'
        assert res.data['niveau'] == 'Tle'

        epreuve = Epreuves.objects.get(id_epreuve=res.data['id_epreuve'])
        questions = Questions.objects.filter(id_epreuve=epreuve)
        assert questions.count() == 3
        # La réponse correcte doit figurer dans les options (sinon non corrigeable).
        for q in questions:
            assert q.reponse_correcte in q.options

    def test_clamp_nb_questions(self, monkeypatch):
        monkeypatch.setattr(exercice_views.ai_service, 'chat',
                            lambda *a, **k: FAUSSE_REPONSE_IA)
        c = APIClient()
        register_and_auth(c, ELEVE)
        matiere = self._matiere()
        res = c.post('/api/v1/exercices/generer/',
                     {'id_matiere': str(matiere.id_matiere), 'nb_questions': 99},
                     format='json')
        # L'IA simulée n'a renvoyé que 3 questions valides → on en a 3.
        assert res.status_code == 201
        assert Questions.objects.filter(id_epreuve=res.data['id_epreuve']).count() == 3

    def test_fallback_banque_si_ia_indisponible(self, monkeypatch):
        def ko(*a, **k):
            raise exercice_views.ai_service.AIUnavailable("pas de clé")
        monkeypatch.setattr(exercice_views.ai_service, 'chat', ko)

        c = APIClient()
        register_and_auth(c, ELEVE)
        matiere = self._matiere()
        # Banque : une épreuve existante avec des QCM corrigeables.
        source = Epreuves.objects.create(
            id_matiere=matiere, titre='Banque', type_epreuve='simulation',
            niveau='Tle', statut='actif')
        for i in range(1, 5):
            Questions.objects.create(
                id_epreuve=source, numero_ordre=i, enonce=f"Q{i} ?",
                type_question='qcm', options=['A', 'B', 'C', 'D'],
                reponse_correcte='A', difficulte='moyen')

        res = c.post('/api/v1/exercices/generer/',
                     {'id_matiere': str(matiere.id_matiere), 'nb_questions': 3},
                     format='json')
        assert res.status_code == 201, res.data
        assert res.data['source_generation'] == 'banque'
        assert Questions.objects.filter(id_epreuve=res.data['id_epreuve']).count() == 3

    def test_503_si_ia_ko_et_banque_vide(self, monkeypatch):
        def ko(*a, **k):
            raise exercice_views.ai_service.AIUnavailable("pas de clé")
        monkeypatch.setattr(exercice_views.ai_service, 'chat', ko)

        c = APIClient()
        register_and_auth(c, ELEVE)
        matiere = self._matiere()
        res = c.post('/api/v1/exercices/generer/',
                     {'id_matiere': str(matiere.id_matiere)}, format='json')
        assert res.status_code == 503

    def test_json_ia_illisible_bascule_fallback(self, monkeypatch):
        monkeypatch.setattr(exercice_views.ai_service, 'chat',
                            lambda *a, **k: "désolé je ne peux pas")
        c = APIClient()
        register_and_auth(c, ELEVE)
        matiere = self._matiere()
        source = Epreuves.objects.create(
            id_matiere=matiere, titre='Banque', type_epreuve='simulation',
            niveau='Tle', statut='actif')
        Questions.objects.create(
            id_epreuve=source, numero_ordre=1, enonce="Q1 ?",
            type_question='qcm', options=['A', 'B'], reponse_correcte='A',
            difficulte='moyen')

        res = c.post('/api/v1/exercices/generer/',
                     {'id_matiere': str(matiere.id_matiere), 'nb_questions': 3},
                     format='json')
        assert res.status_code == 201
        assert res.data['source_generation'] == 'banque'
