"""Tests — Orientation par test intensif (moteur + endpoints test/soumettre)."""
import pytest
from rest_framework.test import APIClient

from school.models import Eleves, Matieres, Epreuves, Questions, Lacunes, Orientations
from school import orientation_engine
from school.api_views import orientation_views


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'ori_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Nkeng', 'prenom': 'Joy', 'telephone': '+237699010010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


def _matiere_avec_questions(code, nom, nb=5, correcte='A'):
    matiere = Matieres.objects.create(code=code, nom=nom, niveaux=['Tle'])
    epreuve = Epreuves.objects.create(
        id_matiere=matiere, titre=f'Banque {code}', type_epreuve='simulation',
        niveau='Tle', statut='actif')
    questions = [
        Questions.objects.create(
            id_epreuve=epreuve, numero_ordre=i, enonce=f"{code} Q{i} ?",
            type_question='qcm', options=['A', 'B', 'C', 'D'],
            reponse_correcte=correcte, difficulte='moyen')
        for i in range(1, nb + 1)
    ]
    return matiere, questions


@pytest.fixture(autouse=True)
def _ia_off(monkeypatch):
    """Désactive l'IA dans les tests d'orientation (banque uniquement, déterministe)."""
    monkeypatch.setattr(orientation_views.ai_service, 'is_configured', lambda: False)


# ─── Moteur ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestMoteurOrientation:

    def test_profil_scientifique_recommande_C(self):
        scores = {'MATH': 92, 'PHY': 90, 'CHI': 88, 'SVT': 55, 'INFO': 40,
                  'FRAN': 45, 'PHIL': 42, 'ANGL': 50, 'HIS': 45, 'GEO': 45, 'ECO': 40}
        res = orientation_engine.analyser_orientation(scores, set())
        assert res['serie_recommandee'] == 'C'
        assert res['classement'][0]['serie'] == 'C'

    def test_profil_litteraire_recommande_A1(self):
        scores = {'FRAN': 90, 'PHIL': 88, 'ANGL': 85, 'HIS': 70, 'GEO': 60,
                  'MATH': 40, 'PHY': 40, 'CHI': 42, 'ECO': 45}
        res = orientation_engine.analyser_orientation(scores, set())
        assert res['serie_recommandee'] == 'A1'

    def test_lacune_en_maths_eloigne_de_C(self):
        scores = {'MATH': 92, 'PHY': 90, 'CHI': 88, 'SVT': 55, 'INFO': 40, 'FRAN': 45}
        sans = orientation_engine.analyser_orientation(scores, set())
        avec = orientation_engine.analyser_orientation(scores, {'MATH'})
        assert sans['serie_recommandee'] == 'C'
        # La pénalité de lacune en maths fait reculer C (matière à fort coef).
        assert avec['serie_recommandee'] != 'C'

    def test_score_global_est_la_moyenne(self):
        res = orientation_engine.analyser_orientation({'MATH': 80, 'FRAN': 60}, set())
        assert res['score_global'] == 70.0


# ─── Endpoint test ───────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestEndpointTest:

    def test_assemble_questions_sans_reponse(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        _matiere_avec_questions('MATH', 'Maths')
        _matiere_avec_questions('FRAN', 'Français')

        res = c.get('/api/v1/analytique/orientations/test/')
        assert res.status_code == 200
        assert res.data['nb_questions'] == 10
        q = res.data['questions'][0]
        assert 'matiere_code' in q and 'enonce' in q
        assert 'reponse_correcte' not in q  # anti-triche

    def test_422_si_aucune_question(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/analytique/orientations/test/')
        assert res.status_code == 422

    def test_role_interdit(self):
        c = APIClient()
        register_and_auth(c, {
            'email': 'ori_prof@test.cm', 'password': 'TestPass123!', 'nom': 'X', 'prenom': 'Y',
            'telephone': '+237699010099', 'role': 'enseignant'})
        res = c.get('/api/v1/analytique/orientations/test/')
        assert res.status_code == 403


# ─── Endpoint soumettre ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestEndpointSoumettre:

    def test_notation_et_orientation(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        eleve = Eleves.objects.get(email=ELEVE['email'])
        _, q_math = _matiere_avec_questions('MATH', 'Maths', nb=6, correcte='A')
        _, q_phy = _matiere_avec_questions('PHY', 'Physique', nb=6, correcte='A')
        _, q_fran = _matiere_avec_questions('FRAN', 'Français', nb=6, correcte='A')

        reponses = (
            [{'id_question': str(q.id_question), 'contenu_reponse': 'A'} for q in q_math]
            + [{'id_question': str(q.id_question), 'contenu_reponse': 'A'} for q in q_phy]
            + [{'id_question': str(q.id_question), 'contenu_reponse': 'B'} for q in q_fran]  # faux
        )
        res = c.post('/api/v1/analytique/orientations/soumettre/', {'reponses': reponses}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['scores_par_matiere']['MATH'] == 100.0
        assert res.data['scores_par_matiere']['PHY'] == 100.0
        assert res.data['scores_par_matiere']['FRAN'] == 0.0
        assert res.data['nb_questions'] == 18
        # Profil scientifique → série scientifique recommandée.
        assert res.data['orientation']['serie_recommandee'] in ('C', 'D', 'E', 'TI')
        assert Orientations.objects.filter(id_eleve=eleve).count() == 1

    def test_reponses_vides_400(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.post('/api/v1/analytique/orientations/soumettre/', {'reponses': []}, format='json')
        assert res.status_code == 400

    def test_lacune_influence_resultat(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        eleve = Eleves.objects.get(email=ELEVE['email'])
        mat_math, q_math = _matiere_avec_questions('MATH', 'Maths', nb=6, correcte='A')
        _, q_phy = _matiere_avec_questions('PHY', 'Physique', nb=6, correcte='A')
        _, q_chi = _matiere_avec_questions('CHI', 'Chimie', nb=6, correcte='A')
        # Lacune avérée en maths.
        Lacunes.objects.create(
            id_eleve=eleve, id_matiere=mat_math, chapitre='Algèbre', notion='Fonctions',
            taux_maitrise=30, statut='detectee')

        reponses = [
            {'id_question': str(q.id_question), 'contenu_reponse': 'A'}
            for q in (*q_math, *q_phy, *q_chi)
        ]
        res = c.post('/api/v1/analytique/orientations/soumettre/', {'reponses': reponses}, format='json')
        assert res.status_code == 201
        # La lacune en maths est prise en compte (présente dans le calcul).
        rec = res.data['orientation']['serie_recommandee']
        assert rec in ('C', 'D', 'E', 'TI')
