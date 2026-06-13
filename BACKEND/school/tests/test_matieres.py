"""Régression — la liste des matières ne doit pas planter (JSONField + filtres)."""
import pytest
from rest_framework.test import APIClient

from school.models import Matieres


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'mat_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'A', 'prenom': 'B', 'telephone': '+237699030010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


@pytest.mark.django_db
class TestMatieresList:

    def _auth(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        return c

    def test_liste_ne_plante_pas(self):
        Matieres.objects.create(code='MATH', nom='Maths', niveaux=['Tle', '1ere'], series=['C', 'D'])
        res = self._auth().get('/api/v1/matieres/')
        assert res.status_code == 200

    def test_filtre_par_niveau(self):
        Matieres.objects.create(code='MATH', nom='Maths', niveaux=['Tle'], series=['C'])
        Matieres.objects.create(code='PHIL', nom='Philo', niveaux=['Tle'], series=['A1'])
        Matieres.objects.create(code='SVT6', nom='SVT', niveaux=['6e'], series=[])
        c = self._auth()
        res = c.get('/api/v1/matieres/', {'niveau': 'Tle'})
        assert res.status_code == 200
        codes = [m['code'] for m in (res.data.get('results') or res.data)]
        assert 'MATH' in codes and 'PHIL' in codes and 'SVT6' not in codes

    def test_filtre_par_serie(self):
        Matieres.objects.create(code='MATH', nom='Maths', niveaux=['Tle'], series=['C', 'D'])
        Matieres.objects.create(code='PHIL', nom='Philo', niveaux=['Tle'], series=['A1'])
        c = self._auth()
        res = c.get('/api/v1/matieres/', {'serie': 'C'})
        assert res.status_code == 200
        codes = [m['code'] for m in (res.data.get('results') or res.data)]
        assert 'MATH' in codes and 'PHIL' not in codes
