"""Tests Sprint 3 — Notifications, Chatbot, Sessions Focus, Parent Dashboard."""
import pytest
from unittest.mock import patch
from rest_framework.test import APIClient
from school.models import Notifications, MessagesChatbot, SessionsFocus, Matieres, Eleves, Parents, EleveParent


# ─── Helpers ──────────────────────────────────────────────────────────────────

def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 's3_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Ngu', 'prenom': 'Brice', 'telephone': '+237699000010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}

PARENT = {
    'email': 's3_parent@test.cm', 'password': 'TestPass123!',
    'nom': 'Ngu', 'prenom': 'Claire', 'telephone': '+237699000011',
    'role': 'parent',
}


# ─── Notifications ────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestNotifications:
    def test_list_empty(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/notifications/')
        assert res.status_code == 200
        assert res.data['results'] == [] or res.data == []

    def test_list_with_notification(self):
        c = APIClient()
        data = register_and_auth(c, ELEVE)
        from school.models import Utilisateur
        user = Utilisateur.objects.get(email=ELEVE['email'])
        Notifications.objects.create(
            id_utilisateur=user,
            type_notif='badge',
            titre='Nouveau badge !',
            message='Tu as obtenu le badge Débutant.',
            canal='push',
        )
        res = c.get('/api/v1/notifications/')
        assert res.status_code == 200
        results = res.data.get('results', res.data)
        assert len(results) == 1
        assert results[0]['titre'] == 'Nouveau badge !'
        assert results[0]['lue'] is False

    def test_count_non_lues(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        from school.models import Utilisateur
        user = Utilisateur.objects.get(email=ELEVE['email'])
        Notifications.objects.create(
            id_utilisateur=user, type_notif='rappel',
            titre='Rappel', message='Révise tes cours.', canal='push',
        )
        res = c.get('/api/v1/notifications/count/')
        assert res.status_code == 200
        assert res.data['non_lues'] == 1

    def test_mark_as_read(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        from school.models import Utilisateur
        user = Utilisateur.objects.get(email=ELEVE['email'])
        notif = Notifications.objects.create(
            id_utilisateur=user, type_notif='badge',
            titre='Test', message='Msg', canal='push',
        )
        res = c.patch(f'/api/v1/notifications/{notif.id_notification}/read/')
        assert res.status_code == 200
        notif.refresh_from_db()
        assert notif.lue is True

    def test_mark_all_read(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        from school.models import Utilisateur
        user = Utilisateur.objects.get(email=ELEVE['email'])
        Notifications.objects.create(
            id_utilisateur=user, type_notif='rappel', titre='A', message='m', canal='push',
        )
        Notifications.objects.create(
            id_utilisateur=user, type_notif='rappel', titre='B', message='m', canal='push',
        )
        res = c.post('/api/v1/notifications/read-all/')
        assert res.status_code == 200
        assert Notifications.objects.filter(id_utilisateur=user, lue=False).count() == 0


# ─── Chatbot ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestChatbot:
    def test_message_sans_cle_api(self):
        """Sans API key configurée → réponse de fallback (200 OK)."""
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_chat_eleve@test.cm', 'telephone': '+237699000020'})
        with patch('django.conf.settings.ANTHROPIC_API_KEY', ''):
            res = c.post('/api/v1/chatbot/message/', {'contenu': 'Bonjour'}, format='json')
        assert res.status_code == 200
        assert 'reponse' in res.data
        assert 'session_chat' in res.data

    def test_message_vide_400(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_chat_empty@test.cm', 'telephone': '+237699000021'})
        res = c.post('/api/v1/chatbot/message/', {'contenu': '   '}, format='json')
        assert res.status_code == 400

    def test_parent_interdit(self):
        c = APIClient()
        register_and_auth(c, {**PARENT, 'email': 's3_chatparent@test.cm', 'telephone': '+237699000022'})
        res = c.post('/api/v1/chatbot/message/', {'contenu': 'Bonjour'}, format='json')
        assert res.status_code == 403

    def test_historique_vide(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_histo@test.cm', 'telephone': '+237699000023'})
        res = c.get('/api/v1/chatbot/historique/')
        assert res.status_code == 200

    def test_message_persiste_dans_historique(self):
        import uuid as _uuid
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_persist@test.cm', 'telephone': '+237699000024'})
        session_id = str(_uuid.uuid4())
        with patch('django.conf.settings.ANTHROPIC_API_KEY', ''):
            res = c.post('/api/v1/chatbot/message/', {
                'contenu': 'Explique les fonctions',
                'session_chat': session_id,
            }, format='json')
        assert res.status_code == 200
        assert res.data['session_chat'] == session_id
        hist = c.get(f'/api/v1/chatbot/historique/?session_chat={session_id}')
        assert hist.status_code == 200
        results = hist.data.get('results', hist.data)
        assert len(results) == 2  # user + assistant


# ─── Sessions Focus ───────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestFocus:
    def test_start_focus(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_focus@test.cm', 'telephone': '+237699000030'})
        res = c.post('/api/v1/focus/start/', {'duree_pomodoro_min': 25}, format='json')
        assert res.status_code == 201
        assert res.data['duree_pomodoro_min'] == 25
        assert res.data['date_fin'] is None

    def test_stop_focus_donne_xp(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_focusstop@test.cm', 'telephone': '+237699000031'})
        start = c.post('/api/v1/focus/start/', {'duree_pomodoro_min': 25}, format='json')
        focus_id = start.data['id_focus']
        stop = c.post(f'/api/v1/focus/{focus_id}/stop/', {'nb_sessions': 2}, format='json')
        assert stop.status_code == 200
        assert stop.data['xp_gagne'] == 10  # 2 × 5
        assert stop.data['date_fin'] is not None

    def test_double_stop_404(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_dbstop@test.cm', 'telephone': '+237699000032'})
        start = c.post('/api/v1/focus/start/', {}, format='json')
        focus_id = start.data['id_focus']
        c.post(f'/api/v1/focus/{focus_id}/stop/', {}, format='json')
        res = c.post(f'/api/v1/focus/{focus_id}/stop/', {}, format='json')
        assert res.status_code == 404

    def test_list_focus(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_listfocus@test.cm', 'telephone': '+237699000033'})
        c.post('/api/v1/focus/start/', {'duree_pomodoro_min': 30}, format='json')
        res = c.get('/api/v1/focus/')
        assert res.status_code == 200
        results = res.data.get('results', res.data)
        assert len(results) >= 1

    def test_parent_ne_peut_pas_focus(self):
        c = APIClient()
        register_and_auth(c, {**PARENT, 'email': 's3_pfocus@test.cm', 'telephone': '+237699000034'})
        res = c.post('/api/v1/focus/start/', {}, format='json')
        assert res.status_code == 403


# ─── Parent Dashboard ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestParentDashboard:
    def _setup_parent_with_eleve(self):
        """Crée un parent lié à un élève via code de liaison."""
        eleve_c = APIClient()
        register_and_auth(eleve_c, {**ELEVE, 'email': 's3_pde@test.cm', 'telephone': '+237699000040'})

        parent_c = APIClient()
        register_and_auth(parent_c, {**PARENT, 'email': 's3_pdp@test.cm', 'telephone': '+237699000041'})

        # Récupérer le code de liaison de l'élève
        code_res = eleve_c.get('/api/v1/users/me/code-liaison/')
        code = code_res.data['code']

        # Lier l'enfant
        link_res = parent_c.post('/api/v1/parents/lier/', {'code': code}, format='json')
        assert link_res.status_code == 200, link_res.data

        return parent_c, eleve_c

    def test_enfants_list(self):
        parent_c, _ = self._setup_parent_with_eleve()
        res = parent_c.get('/api/v1/parents/enfants/')
        assert res.status_code == 200
        assert len(res.data) == 1

    def test_generer_rapport(self):
        parent_c, eleve_c = self._setup_parent_with_eleve()
        me_res = eleve_c.get('/api/v1/users/me/')
        eleve_id = me_res.data['id_utilisateur']
        res = parent_c.post('/api/v1/parents/rapports/generer/', {'enfant_id': eleve_id}, format='json')
        assert res.status_code == 201
        assert 'rapport' in res.data

    def test_eleve_ne_peut_pas_voir_enfants(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's3_noenfant@test.cm', 'telephone': '+237699000042'})
        res = c.get('/api/v1/parents/enfants/')
        assert res.status_code == 403
