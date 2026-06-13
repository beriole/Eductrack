"""Exercices enseignant : créer avec questions/corrections, remplacer les questions."""
import pytest
from rest_framework.test import APIClient

from school.models import Enseignants, Eleves, Matieres, Epreuves, Questions, SessionsExamen


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


PROF = {
    'email': 'exo_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Owona', 'prenom': 'Luc', 'telephone': '+237699060010', 'role': 'enseignant',
}
ELEVE = {
    'email': 'exo_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'X', 'prenom': 'Y', 'telephone': '+237699060012',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


@pytest.fixture
def setup(db):
    c = APIClient(); register_and_auth(c, PROF)
    prof = Enseignants.objects.get(email=PROF['email'])
    matiere = Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])
    return c, prof, matiere


def _payload(matiere, questions=None):
    return {
        'titre': 'Exercice dérivées', 'id_matiere': str(matiere.id_matiere), 'niveau': 'Tle',
        'questions': questions if questions is not None else [
            {'enonce': 'Dérivée de x² ?', 'type_question': 'qcm',
             'options': ['2x', 'x', 'x²'], 'reponse_correcte': '2x',
             'explication': 'n·x^(n-1) avec n=2.', 'points': 2},
            {'enonce': 'Dérivée de 3x ?', 'type_question': 'qcm',
             'options': ['3', 'x', '0'], 'reponse_correcte': '3', 'explication': 'Constante.'},
        ],
    }


@pytest.mark.django_db
class TestExercicesEnseignant:

    def test_creer_exercice_avec_questions(self, setup):
        c, prof, matiere = setup
        res = c.post('/api/v1/enseignant/exercices/', _payload(matiere), format='json')
        assert res.status_code == 201, res.data
        assert res.data['type_epreuve'] == 'exercice'
        assert len(res.data['questions']) == 2
        assert res.data['questions'][0]['reponse_correcte'] == '2x'
        assert res.data['questions'][0]['explication'].startswith('n·x')
        ep = Epreuves.objects.get(id_epreuve=res.data['id_epreuve'])
        assert ep.id_enseignant == prof and ep.nb_questions == 2

    def test_eleve_interdit(self, setup):
        _, _, matiere = setup
        c = APIClient(); register_and_auth(c, ELEVE)
        res = c.post('/api/v1/enseignant/exercices/', _payload(matiere), format='json')
        assert res.status_code == 403

    def test_refuse_bonne_reponse_hors_options(self, setup):
        c, prof, matiere = setup
        bad = _payload(matiere, [{'enonce': 'Q', 'type_question': 'qcm',
                                  'options': ['A', 'B'], 'reponse_correcte': 'Z'}])
        res = c.post('/api/v1/enseignant/exercices/', bad, format='json')
        assert res.status_code == 400
        assert 'details' in res.data

    def test_refuse_sans_question(self, setup):
        c, prof, matiere = setup
        res = c.post('/api/v1/enseignant/exercices/', _payload(matiere, []), format='json')
        assert res.status_code == 400

    def test_remplacer_questions(self, setup):
        c, prof, matiere = setup
        cid = c.post('/api/v1/enseignant/exercices/', _payload(matiere), format='json').data['id_epreuve']
        nouvelles = [{'enonce': 'Nouvelle Q ?', 'type_question': 'vrai_faux',
                      'options': ['Vrai', 'Faux'], 'reponse_correcte': 'Vrai', 'explication': 'Oui.'}]
        res = c.put(f'/api/v1/enseignant/exercices/{cid}/questions/', {'questions': nouvelles}, format='json')
        assert res.status_code == 200
        assert len(res.data['questions']) == 1
        assert Questions.objects.filter(id_epreuve=cid).count() == 1
        assert res.data['questions'][0]['enonce'] == 'Nouvelle Q ?'

    def test_refuse_edition_si_session_existe(self, setup):
        c, prof, matiere = setup
        cid = c.post('/api/v1/enseignant/exercices/', _payload(matiere), format='json').data['id_epreuve']
        eleve = Eleves.objects.create(
            email='s2@x.cm', telephone='+237600000701', nom='S', prenom='T',
            role='eleve', niveau_scolaire='Tle', region='Centre')
        SessionsExamen.objects.create(id_eleve=eleve, id_epreuve_id=cid, statut='termine')
        res = c.put(f'/api/v1/enseignant/exercices/{cid}/questions/',
                    {'questions': [{'enonce': 'Q', 'type_question': 'qcm',
                                    'options': ['A', 'B'], 'reponse_correcte': 'A'}]}, format='json')
        assert res.status_code == 400

    def test_apparait_dans_la_liste_enseignant(self, setup):
        c, prof, matiere = setup
        c.post('/api/v1/enseignant/exercices/', _payload(matiere), format='json')
        res = c.get('/api/v1/enseignant/epreuves/', {'type_epreuve': 'exercice'})
        items = res.data.get('results', res.data)
        assert any(e['titre'] == 'Exercice dérivées' for e in items)
