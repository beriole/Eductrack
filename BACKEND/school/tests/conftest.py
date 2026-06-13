import pytest
from rest_framework.test import APIClient
from django.core.cache import cache


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def eleve_data():
    return {
        'email': 'eleve@test.cm',
        'password': 'TestPass123!',
        'nom': 'Dupont',
        'prenom': 'Jean',
        'telephone': '+237690000001',
        'role': 'eleve',
        'niveau_scolaire': 'Tle',
        'region': 'Centre',
    }


@pytest.fixture
def parent_data():
    return {
        'email': 'parent@test.cm',
        'password': 'TestPass123!',
        'nom': 'Dupont',
        'prenom': 'Marie',
        'telephone': '+237690000002',
        'role': 'parent',
    }


@pytest.fixture
def enseignant_data():
    return {
        'email': 'prof@test.cm',
        'password': 'TestPass123!',
        'nom': 'Martin',
        'prenom': 'Paul',
        'telephone': '+237690000003',
        'role': 'enseignant',
    }


@pytest.fixture
def registered_eleve(api_client, eleve_data):
    response = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
    assert response.status_code == 201, f"Inscription échouée: {response.data}"
    return response.data


@pytest.fixture
def auth_client_eleve(api_client, eleve_data):
    reg = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
    assert reg.status_code == 201, f"Inscription échouée: {reg.data}"
    token = reg.data['tokens']['access']
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return api_client
