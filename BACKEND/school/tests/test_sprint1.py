import pytest
from django.core.cache import cache
from unittest.mock import patch


@pytest.mark.django_db
class TestEmailVerification:

    def test_verify_email_token_valide(self, api_client, eleve_data):
        reg = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert reg.status_code == 201
        uid = reg.data['user']['id_utilisateur']

        # Simuler un token stocké en cache (comme le ferait Celery)
        token = 'abc123testtoken'
        cache.set(f'email_verify_{uid}', token, timeout=86400)

        response = api_client.post('/api/v1/auth/email/verify/', {'uid': uid, 'token': token}, format='json')
        assert response.status_code == 200
        assert 'vérifié' in response.data['message']

    def test_verify_email_token_invalide(self, api_client, eleve_data):
        reg = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        uid = reg.data['user']['id_utilisateur']

        response = api_client.post('/api/v1/auth/email/verify/', {'uid': uid, 'token': 'mauvais_token'}, format='json')
        assert response.status_code == 400

    def test_verify_email_deja_verifie(self, api_client, eleve_data):
        reg = api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        uid = reg.data['user']['id_utilisateur']

        token = 'token_ok'
        cache.set(f'email_verify_{uid}', token, timeout=86400)

        api_client.post('/api/v1/auth/email/verify/', {'uid': uid, 'token': token}, format='json')
        # Deuxième appel
        cache.set(f'email_verify_{uid}', token, timeout=86400)
        response = api_client.post('/api/v1/auth/email/verify/', {'uid': uid, 'token': token}, format='json')
        assert response.status_code == 200

    @patch('school.api_views.auth_views.send_verification_email.delay')
    def test_inscription_declenche_email_verification(self, mock_task, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        assert mock_task.called

    def test_resend_verification_utilisateur_inexistant(self, api_client):
        response = api_client.post('/api/v1/auth/email/resend/', {'email': 'nope@test.cm'}, format='json')
        # Ne doit pas révéler si l'email existe
        assert response.status_code == 200


@pytest.mark.django_db
class TestPasswordReset:

    def test_reset_request_email_inconnu_retourne_200(self, api_client):
        response = api_client.post('/api/v1/auth/password/reset/', {'email': 'inconnu@test.cm'}, format='json')
        assert response.status_code == 200

    @patch('school.api_views.password_views.send_password_reset_otp.delay')
    def test_reset_request_email_connu_declenche_otp(self, mock_task, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        response = api_client.post('/api/v1/auth/password/reset/', {'email': eleve_data['email']}, format='json')
        assert response.status_code == 200
        assert mock_task.called

    def test_reset_confirm_otp_invalide(self, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        response = api_client.post('/api/v1/auth/password/reset/confirm/', {
            'email': eleve_data['email'],
            'otp': '999999',
            'new_password': 'NewPass456!',
        }, format='json')
        assert response.status_code == 400

    def test_reset_confirm_otp_valide(self, api_client, eleve_data):
        api_client.post('/api/v1/auth/register/', eleve_data, format='json')
        email = eleve_data['email']

        # Stocker un OTP fictif en cache
        cache.set(f'otp_reset_{email}', '123456', timeout=600)

        response = api_client.post('/api/v1/auth/password/reset/confirm/', {
            'email': email,
            'otp': '123456',
            'new_password': 'NewPass456!',
        }, format='json')
        assert response.status_code == 200

        # Vérifier que la connexion avec l'ancien mot de passe échoue
        login = api_client.post('/api/v1/auth/login/', {
            'email': email,
            'password': eleve_data['password'],
        }, format='json')
        assert login.status_code == 401

        # Connexion avec le nouveau mot de passe
        login_new = api_client.post('/api/v1/auth/login/', {
            'email': email,
            'password': 'NewPass456!',
        }, format='json')
        assert login_new.status_code == 200


@pytest.mark.django_db
class TestPasswordChange:

    def test_change_password_non_authentifie(self, api_client):
        response = api_client.post('/api/v1/auth/password/change/', {
            'old_password': 'whatever',
            'new_password': 'NewPass456!',
        }, format='json')
        assert response.status_code == 401

    def test_change_password_succes(self, auth_client_eleve, eleve_data):
        response = auth_client_eleve.post('/api/v1/auth/password/change/', {
            'old_password': eleve_data['password'],
            'new_password': 'NewPass456!',
        }, format='json')
        assert response.status_code == 200

    def test_change_password_ancien_incorrect(self, auth_client_eleve):
        response = auth_client_eleve.post('/api/v1/auth/password/change/', {
            'old_password': 'mauvais_mdp',
            'new_password': 'NewPass456!',
        }, format='json')
        assert response.status_code == 400

    def test_change_password_identique_retourne_400(self, auth_client_eleve, eleve_data):
        response = auth_client_eleve.post('/api/v1/auth/password/change/', {
            'old_password': eleve_data['password'],
            'new_password': eleve_data['password'],
        }, format='json')
        assert response.status_code == 400


@pytest.mark.django_db
class TestCodeLiaison:

    def test_code_liaison_actuel_eleve(self, auth_client_eleve):
        response = auth_client_eleve.get('/api/v1/users/me/code-liaison/')
        assert response.status_code == 200
        assert 'code' in response.data
        assert len(response.data['code']) == 8

    def test_regenerer_code_liaison(self, auth_client_eleve):
        # Obtenir le code initial
        r1 = auth_client_eleve.get('/api/v1/users/me/code-liaison/')
        code_initial = r1.data['code']

        # Régénérer
        r2 = auth_client_eleve.post('/api/v1/users/me/code-liaison/regenerer/')
        assert r2.status_code == 201
        assert r2.data['code'] != code_initial

    def test_code_liaison_refuse_si_parent(self, api_client, parent_data):
        reg = api_client.post('/api/v1/auth/register/', parent_data, format='json')
        token = reg.data['tokens']['access']
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        response = api_client.get('/api/v1/users/me/code-liaison/')
        assert response.status_code == 403

    def test_eleve_liste_parents_vide(self, auth_client_eleve):
        response = auth_client_eleve.get('/api/v1/eleve/parents/')
        assert response.status_code == 200
        assert response.data == []
