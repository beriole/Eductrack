"""Tests Sprint 5 — Orientations scolaires, Tableau enseignant, Rapport PDF."""
import pytest
import uuid
import datetime
from rest_framework.test import APIClient
from school.models import (
    Eleves, Parents, Enseignants, EleveParent, RapportsParentaux,
    Matieres, Orientations,
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 's5_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Simo', 'prenom': 'Paul', 'telephone': '+237699200010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}
PARENT = {
    'email': 's5_parent@test.cm', 'password': 'TestPass123!',
    'nom': 'Simo', 'prenom': 'Anne', 'telephone': '+237699200011',
    'role': 'parent',
}
ENSEIGNANT = {
    'email': 's5_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Ngono', 'prenom': 'Marc', 'telephone': '+237699200012',
    'role': 'enseignant',
}

POST_URL = '/api/v1/analytique/orientations/creer/'
LIST_URL = '/api/v1/analytique/orientations/'


# ─── Orientations scolaires ────────────────────────────────────────────────────

@pytest.mark.django_db
class TestOrientations:

    def test_serie_C_scores_math_physique_dominants(self):
        """MATH=85 + PHY=75 → Série C (sciences pures)."""
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.post(POST_URL, {'scores_matieres': {'MATH': 85, 'PHY': 75, 'SVT': 40, 'FRAN': 50}}, format='json')
        assert res.status_code == 201
        assert res.data['orientation']['serie_recommandee'] == 'C'
        assert 'Ingénieur Civil' in res.data['orientation']['metiers_recommandes']
        assert 'serie_label' in res.data

    def test_serie_D_scores_svt_dominants(self):
        """MATH=65 + SVT=75 mais PHY<65 → Série D (biologie)."""
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e2@test.cm', 'telephone': '+237699200013'})
        res = c.post(POST_URL, {'scores_matieres': {'MATH': 65, 'SVT': 75, 'PHY': 40, 'FRAN': 50}}, format='json')
        assert res.status_code == 201
        assert res.data['orientation']['serie_recommandee'] == 'D'

    def test_serie_A1_scores_francais_dominant(self):
        """FRAN=85 mais maths faibles → Série A1 (lettres)."""
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e3@test.cm', 'telephone': '+237699200014'})
        res = c.post(POST_URL, {'scores_matieres': {'FRAN': 85, 'MATH': 40, 'PHY': 30, 'SVT': 35}}, format='json')
        assert res.status_code == 201
        assert res.data['orientation']['serie_recommandee'] == 'A1'

    def test_serie_G_fallback_scores_bas(self):
        """Aucun critère atteint → fallback Série G."""
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e4@test.cm', 'telephone': '+237699200015'})
        res = c.post(POST_URL, {'scores_matieres': {'MATH': 40, 'PHY': 35, 'SVT': 30, 'FRAN': 45}}, format='json')
        assert res.status_code == 201
        assert res.data['orientation']['serie_recommandee'] == 'G'

    def test_liste_orientations_vide(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e5@test.cm', 'telephone': '+237699200016'})
        res = c.get(LIST_URL)
        assert res.status_code == 200
        results = res.data.get('results', res.data)
        assert len(results) == 0

    def test_liste_orientations_apres_creation(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e6@test.cm', 'telephone': '+237699200017'})
        c.post(POST_URL, {'scores_matieres': {'MATH': 75, 'PHY': 70}}, format='json')
        res = c.get(LIST_URL)
        assert res.status_code == 200
        results = res.data.get('results', res.data)
        assert len(results) == 1

    def test_parent_ne_peut_pas_creer_orientation(self):
        c = APIClient()
        register_and_auth(c, PARENT)
        res = c.post(POST_URL, {'scores_matieres': {'MATH': 80}}, format='json')
        assert res.status_code == 403

    def test_scores_manquants_retourne_400(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e7@test.cm', 'telephone': '+237699200018'})
        res = c.post(POST_URL, {}, format='json')
        assert res.status_code == 400

    def test_orientation_stocke_reponses_et_aptitudes(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e8@test.cm', 'telephone': '+237699200019'})
        res = c.post(POST_URL, {'scores_matieres': {'MATH': 80, 'PHY': 70}}, format='json')
        assert res.status_code == 201
        o = res.data['orientation']
        assert len(o['aptitudes_detectees']) > 0
        assert len(o['filieres_superieures']) > 0
        assert float(o['score_global_test']) > 0


# ─── Tableau de bord Enseignant ────────────────────────────────────────────────

@pytest.mark.django_db
class TestEnseignantDashboard:

    def test_enseignant_voir_dashboard(self):
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        res = c.get('/api/v1/enseignant/dashboard/')
        assert res.status_code == 200
        assert 'stats' in res.data
        assert 'top_cours' in res.data
        assert 'epreuves_recentes' in res.data

    def test_dashboard_stats_initiales(self):
        c = APIClient()
        register_and_auth(c, {**ENSEIGNANT, 'email': 's5_p2@test.cm', 'telephone': '+237699200020'})
        res = c.get('/api/v1/enseignant/dashboard/')
        assert res.status_code == 200
        stats = res.data['stats']
        assert stats['nb_cours'] == 0
        assert stats['total_vues'] == 0
        assert stats['nb_epreuves'] == 0

    def test_eleve_ne_peut_pas_voir_dashboard_enseignant(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_e9@test.cm', 'telephone': '+237699200021'})
        res = c.get('/api/v1/enseignant/dashboard/')
        assert res.status_code == 403

    def test_enseignant_liste_ses_cours(self):
        c = APIClient()
        register_and_auth(c, {**ENSEIGNANT, 'email': 's5_p3@test.cm', 'telephone': '+237699200022'})
        res = c.get('/api/v1/enseignant/cours/')
        assert res.status_code == 200
        assert isinstance(res.data, list)

    def test_parent_ne_peut_pas_voir_liste_cours_enseignant(self):
        c = APIClient()
        register_and_auth(c, {**PARENT, 'email': 's5_pa2@test.cm', 'telephone': '+237699200023'})
        res = c.get('/api/v1/enseignant/cours/')
        assert res.status_code == 403


# ─── Rapport PDF ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestRapportPDF:

    def _setup(self, email_eleve, tel_eleve, email_parent, tel_parent):
        """Crée parent + élève + liaison + rapport directement en DB."""
        c_parent = APIClient()
        c_eleve = APIClient()
        register_and_auth(c_eleve, {**ELEVE, 'email': email_eleve, 'telephone': tel_eleve})
        register_and_auth(c_parent, {**PARENT, 'email': email_parent, 'telephone': tel_parent})

        eleve = Eleves.objects.get(email=email_eleve)
        parent = Parents.objects.get(email=email_parent)
        EleveParent.objects.create(id_eleve=eleve, id_parent=parent, actif=True)

        today = datetime.date.today()
        rapport = RapportsParentaux.objects.create(
            id_parent=parent,
            id_eleve=eleve,
            periode_debut=today - datetime.timedelta(days=7),
            periode_fin=today,
            moyenne_globale=75,
            nb_sessions=5,
            temps_etude_total=120,
            matieres_travaillees=['Mathématiques', 'Physique'],
            lacunes_principales=['Vecteurs', 'Cinématique'],
        )
        return c_parent, rapport

    def test_parent_peut_telecharger_pdf(self):
        c_parent, rapport = self._setup(
            's5_ep1@test.cm', '+237699200030',
            's5_pp1@test.cm', '+237699200031',
        )
        res = c_parent.get(f'/api/v1/parents/rapports/{rapport.id_rapport}/pdf/')
        assert res.status_code == 200
        assert 'application/pdf' in res['Content-Type']

    def test_rapport_inexistant_retourne_404(self):
        c = APIClient()
        register_and_auth(c, {**PARENT, 'email': 's5_pp2@test.cm', 'telephone': '+237699200032'})
        res = c.get(f'/api/v1/parents/rapports/{uuid.uuid4()}/pdf/')
        assert res.status_code == 404

    def test_eleve_ne_peut_pas_telecharger_pdf(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's5_ep3@test.cm', 'telephone': '+237699200033'})
        res = c.get(f'/api/v1/parents/rapports/{uuid.uuid4()}/pdf/')
        assert res.status_code == 403
