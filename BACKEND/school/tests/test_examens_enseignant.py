"""Banque de sujets enseignant : lister ses épreuves, éditer corrigé/méta, supprimer."""
import pytest
from rest_framework.test import APIClient

from school.models import Enseignants, Eleves, Matieres, Epreuves, Questions, SessionsExamen


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


PROF = {
    'email': 'ex_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Atangana', 'prenom': 'Marc', 'telephone': '+237699050010', 'role': 'enseignant',
}
PROF2 = {
    'email': 'ex_prof2@test.cm', 'password': 'TestPass123!',
    'nom': 'Bello', 'prenom': 'Sara', 'telephone': '+237699050011', 'role': 'enseignant',
}
ELEVE = {
    'email': 'ex_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'X', 'prenom': 'Y', 'telephone': '+237699050012',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


def _epreuve(prof, matiere, **kw):
    defaults = dict(titre='BAC Maths 2023', type_epreuve='officielle', niveau='Tle', annee=2023)
    defaults.update(kw)
    return Epreuves.objects.create(id_enseignant=prof, id_matiere=matiere, **defaults)


@pytest.fixture
def setup(db):
    c = APIClient(); register_and_auth(c, PROF)
    prof = Enseignants.objects.get(email=PROF['email'])
    matiere = Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])
    return c, prof, matiere


@pytest.mark.django_db
class TestBanqueEpreuves:

    def test_liste_mes_epreuves(self, setup):
        c, prof, matiere = setup
        _epreuve(prof, matiere)
        # Épreuve d'un autre prof — ne doit pas apparaître.
        c2 = APIClient(); register_and_auth(c2, PROF2)
        prof2 = Enseignants.objects.get(email=PROF2['email'])
        _epreuve(prof2, matiere, titre='Autre')

        res = c.get('/api/v1/enseignant/epreuves/')
        assert res.status_code == 200
        items = res.data.get('results', res.data)
        titres = [e['titre'] for e in items]
        assert 'BAC Maths 2023' in titres and 'Autre' not in titres

    def test_filtre_par_annee(self, setup):
        c, prof, matiere = setup
        _epreuve(prof, matiere, annee=2023)
        _epreuve(prof, matiere, titre='BAC 2022', annee=2022)
        res = c.get('/api/v1/enseignant/epreuves/', {'annee': 2022})
        items = res.data.get('results', res.data)
        assert len(items) == 1 and items[0]['annee'] == 2022

    def test_detail_inclut_questions(self, setup):
        c, prof, matiere = setup
        ep = _epreuve(prof, matiere)
        Questions.objects.create(id_epreuve=ep, numero_ordre=1, enonce='Q1', type_question='qcm',
                                 options=['A', 'B'], reponse_correcte='A')
        res = c.get(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/')
        assert res.status_code == 200
        assert len(res.data['questions']) == 1
        assert res.data['questions'][0]['reponse_correcte'] == 'A'  # vue enseignant = réponses visibles

    def test_associer_un_corrige(self, setup):
        c, prof, matiere = setup
        ep = _epreuve(prof, matiere)
        res = c.patch(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/',
                      {'corrige': '1) A car ...  2) Vrai.'}, format='json')
        assert res.status_code == 200
        assert res.data['corrige'].startswith('1) A')
        ep.refresh_from_db()
        assert ep.corrige.startswith('1) A')

    def test_modifier_metadonnees(self, setup):
        c, prof, matiere = setup
        ep = _epreuve(prof, matiere)
        res = c.patch(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/',
                      {'titre': 'BAC Maths 2023 (corrigé)', 'annee': 2024}, format='json')
        assert res.status_code == 200
        assert res.data['titre'].endswith('(corrigé)') and res.data['annee'] == 2024

    def test_eleve_na_pas_acces(self, setup):
        c, prof, matiere = setup
        ep = _epreuve(prof, matiere)
        ce = APIClient(); register_and_auth(ce, ELEVE)
        assert ce.get('/api/v1/enseignant/epreuves/').status_code in (200, 403)
        assert ce.get(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/').status_code == 404

    def test_ne_modifie_pas_epreuve_d_autrui(self, setup):
        c, prof, matiere = setup
        ep = _epreuve(prof, matiere)
        c2 = APIClient(); register_and_auth(c2, PROF2)
        res = c2.patch(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/', {'corrige': 'pirate'}, format='json')
        assert res.status_code == 404

    def test_supprimer_epreuve_sans_session(self, setup):
        c, prof, matiere = setup
        ep = _epreuve(prof, matiere)
        res = c.delete(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/')
        assert res.status_code == 204
        assert not Epreuves.objects.filter(id_epreuve=ep.id_epreuve).exists()

    def test_refuse_suppression_si_session_existe(self, setup):
        c, prof, matiere = setup
        ep = _epreuve(prof, matiere)
        eleve = Eleves.objects.create(
            email='s@x.cm', telephone='+237600000700', nom='S', prenom='T',
            role='eleve', niveau_scolaire='Tle', region='Centre')
        SessionsExamen.objects.create(id_eleve=eleve, id_epreuve=ep, statut='termine')
        res = c.delete(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/')
        assert res.status_code == 400
        assert Epreuves.objects.filter(id_epreuve=ep.id_epreuve).exists()
