import pytest


@pytest.mark.django_db
class TestInscription:

    def test_inscription_eleve_succes(self, api_client, eleve_data):
        response = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert response.status_code == 201
        assert 'tokens' in response.data
        assert 'access' in response.data['tokens']
        assert 'refresh' in response.data['tokens']

    def test_inscription_email_invalide_retourne_400(self, api_client, eleve_data):
        eleve_data['email'] = 'pas-un-email'
        response = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert response.status_code == 400

    def test_inscription_email_deja_utilise_retourne_400(self, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        response = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert response.status_code in (400, 409)

    def test_inscription_sans_mot_de_passe_retourne_400(self, api_client, eleve_data):
        del eleve_data['password']
        response = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert response.status_code == 400

    def test_inscription_parent_succes(self, api_client, parent_data):
        response = api_client.post('/api/v1/auth/register/', parent_data, format='json')
        assert response.status_code == 201

    def test_inscription_eleve_sans_niveau_retourne_400(self, api_client, eleve_data):
        del eleve_data['niveau_scolaire']
        response = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert response.status_code == 400

    def test_inscription_retourne_user_et_tokens(self, api_client, eleve_data):
        response = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert response.status_code == 201
        assert 'user' in response.data
        assert response.data['user']['email'] == eleve_data['email']
        assert response.data['user']['role'] == 'eleve'


@pytest.mark.django_db
class TestConnexion:

    def test_connexion_succes(self, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        response = api_client.post('/api/v1/auth/login/', {
            'email': eleve_data['email'],
            'password': eleve_data['password'],
        }, format='json')
        assert response.status_code == 200
        assert 'tokens' in response.data
        assert 'user' in response.data

    def test_connexion_mauvais_mot_de_passe_retourne_401(self, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        response = api_client.post('/api/v1/auth/login/', {
            'email': eleve_data['email'],
            'password': 'mauvais_mdp',
        }, format='json')
        assert response.status_code == 401

    def test_connexion_email_inexistant_retourne_401(self, api_client):
        response = api_client.post('/api/v1/auth/login/', {
            'email': 'inexistant@test.cm',
            'password': 'n_importe_quoi',
        }, format='json')
        assert response.status_code == 401

    def test_refresh_token_succes(self, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        login = api_client.post('/api/v1/auth/login/', {
            'email': eleve_data['email'],
            'password': eleve_data['password'],
        }, format='json')
        assert login.status_code == 200
        refresh = login.data['tokens']['refresh']
        response = api_client.post('/api/v1/auth/refresh/', {'refresh': refresh}, format='json')
        assert response.status_code == 200
        assert 'access' in response.data


@pytest.mark.django_db
class TestProfil:

    def test_profil_non_authentifie_retourne_401(self, api_client):
        response = api_client.get('/api/v1/users/me/')
        assert response.status_code == 401

    def test_profil_authentifie_retourne_200(self, auth_client_eleve, eleve_data):
        response = auth_client_eleve.get('/api/v1/users/me/')
        assert response.status_code == 200
        assert response.data['email'] == eleve_data['email']

    def test_mise_a_jour_profil(self, auth_client_eleve):
        response = auth_client_eleve.patch('/api/v1/users/me/', {
            'nom': 'NouveauNom',
        }, format='json')
        assert response.status_code == 200
        assert response.data['nom'] == 'NouveauNom'
