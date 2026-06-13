"""Cohérence du catalogue d'épreuves : les épreuves générées ne polluent pas la liste."""
import pytest
from rest_framework.test import APIClient

from school.models import Eleves, Enseignants, Matieres, Epreuves


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'cat_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'A', 'prenom': 'B', 'telephone': '+237699020010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


@pytest.mark.django_db
def test_catalogue_exclut_les_epreuves_generees():
    c = APIClient()
    register_and_auth(c, ELEVE)
    matiere = Matieres.objects.create(code='MATH', nom='Maths', niveaux=['Tle'])

    # Épreuve officielle (catalogue) vs épreuve générée par le système.
    officielle = Epreuves.objects.create(
        id_matiere=matiere, titre='BAC Blanc', type_epreuve='officielle',
        niveau='Tle', source='MINESEC', statut='actif')
    generee = Epreuves.objects.create(
        id_matiere=matiere, titre='Révision du jour', type_epreuve='exercice',
        niveau='Tle', source='custom', statut='actif')  # id_enseignant = None

    res = c.get('/api/v1/epreuves/')
    ids = [e['id_epreuve'] for e in (res.data.get('results') or res.data)]
    assert str(officielle.id_epreuve) in ids
    assert str(generee.id_epreuve) not in ids


@pytest.mark.django_db
def test_annale_importee_par_enseignant_reste_au_catalogue():
    c = APIClient()
    register_and_auth(c, ELEVE)
    matiere = Matieres.objects.create(code='HIS', nom='Histoire', niveaux=['Tle'])
    prof = Enseignants.objects.create(
        email='cat_prof@test.cm', telephone='+237699020011', nom='P', prenom='Q',
        role='enseignant', specialite='Histoire')
    # Annale importée : source 'custom' éventuel MAIS rattachée à un enseignant.
    annale = Epreuves.objects.create(
        id_matiere=matiere, id_enseignant=prof, titre='Annale 2022',
        type_epreuve='officielle', niveau='Tle', source='custom', statut='actif')

    res = c.get('/api/v1/epreuves/')
    ids = [e['id_epreuve'] for e in (res.data.get('results') or res.data)]
    assert str(annale.id_epreuve) in ids
