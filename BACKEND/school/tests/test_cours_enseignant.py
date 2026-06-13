"""Gestion des cours par l'enseignant : créer, modifier, soumettre, supprimer."""
import pytest
from rest_framework.test import APIClient

from school.models import Enseignants, Eleves, Matieres, Cours


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


PROF = {
    'email': 'crs_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Mbida', 'prenom': 'Paul', 'telephone': '+237699040010', 'role': 'enseignant',
}
PROF2 = {
    'email': 'crs_prof2@test.cm', 'password': 'TestPass123!',
    'nom': 'Ze', 'prenom': 'Jean', 'telephone': '+237699040011', 'role': 'enseignant',
}
ELEVE = {
    'email': 'crs_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'X', 'prenom': 'Y', 'telephone': '+237699040012',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


@pytest.fixture
def matiere(db):
    return Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])


@pytest.mark.django_db
class TestCoursEnseignant:

    def _payload(self, matiere):
        return {
            'id_matiere': str(matiere.id_matiere),
            'titre': 'Les limites de fonctions',
            'contenu': 'Définition, théorèmes et exemples sur les limites.',
            'niveau': 'Tle',
        }

    def test_enseignant_cree_un_brouillon(self, matiere):
        c = APIClient(); register_and_auth(c, PROF)
        res = c.post('/api/v1/cours/', self._payload(matiere), format='json')
        assert res.status_code == 201, res.data
        assert res.data['statut'] == 'brouillon'
        assert res.data['titre'] == 'Les limites de fonctions'

    def test_eleve_ne_peut_pas_creer(self, matiere):
        c = APIClient(); register_and_auth(c, ELEVE)
        res = c.post('/api/v1/cours/', self._payload(matiere), format='json')
        assert res.status_code == 403

    def test_modifier_son_cours(self, matiere):
        c = APIClient(); register_and_auth(c, PROF)
        cid = c.post('/api/v1/cours/', self._payload(matiere), format='json').data['id_cours']
        res = c.patch(f'/api/v1/cours/{cid}/', {'titre': 'Limites — révisé'}, format='json')
        assert res.status_code == 200
        assert res.data['titre'] == 'Limites — révisé'

    def test_ne_peut_pas_modifier_cours_d_autrui(self, matiere):
        c1 = APIClient(); register_and_auth(c1, PROF)
        cid = c1.post('/api/v1/cours/', self._payload(matiere), format='json').data['id_cours']
        c2 = APIClient(); register_and_auth(c2, PROF2)
        res = c2.patch(f'/api/v1/cours/{cid}/', {'titre': 'pirate'}, format='json')
        assert res.status_code == 403

    def test_soumettre_pour_revision(self, matiere):
        c = APIClient(); register_and_auth(c, PROF)
        cid = c.post('/api/v1/cours/', self._payload(matiere), format='json').data['id_cours']
        res = c.post(f'/api/v1/cours/{cid}/soumettre/')
        assert res.status_code == 200
        assert Cours.objects.get(id_cours=cid).statut == 'en_revision'

    def test_supprimer_son_brouillon(self, matiere):
        c = APIClient(); register_and_auth(c, PROF)
        cid = c.post('/api/v1/cours/', self._payload(matiere), format='json').data['id_cours']
        res = c.delete(f'/api/v1/cours/{cid}/')
        assert res.status_code == 204
        assert not Cours.objects.filter(id_cours=cid).exists()

    def test_ne_peut_pas_supprimer_cours_publie(self, matiere):
        prof = None
        c = APIClient(); register_and_auth(c, PROF)
        prof = Enseignants.objects.get(email=PROF['email'])
        cours = Cours.objects.create(
            id_enseignant=prof, id_matiere=matiere, titre='Publié',
            contenu='...', niveau='Tle', statut='publie')
        res = c.delete(f'/api/v1/cours/{cours.id_cours}/')
        assert res.status_code == 403
        assert Cours.objects.filter(id_cours=cours.id_cours).exists()

    def test_liste_mes_cours_inclut_brouillons(self, matiere):
        c = APIClient(); register_and_auth(c, PROF)
        c.post('/api/v1/cours/', self._payload(matiere), format='json')
        res = c.get('/api/v1/cours/', {'statut': 'brouillon'})
        assert res.status_code == 200
        items = res.data.get('results', res.data)
        assert any(x['titre'] == 'Les limites de fonctions' for x in items)
