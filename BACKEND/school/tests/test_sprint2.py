import pytest
from school.models import Matieres, Epreuves, Questions, SessionsExamen


def create_epreuve(niveau='Tle', serie='D'):
    matiere, _ = Matieres.objects.get_or_create(
        code='MATH_T',
        defaults={'nom': 'Maths Test', 'niveaux': [niveau], 'series': [serie]},
    )
    epreuve = Epreuves.objects.create(
        titre='Epreuve Test',
        id_matiere=matiere,
        type_epreuve='officielle',
        annee=2024,
        serie=serie,
        niveau=niveau,
        statut='actif',
        duree_minutes=60,
    )
    # 3 questions QCM
    for i in range(1, 4):
        Questions.objects.create(
            id_epreuve=epreuve,
            enonce=f'Question {i}',
            type_question='qcm',
            options=[{'key': 'A', 'texte': 'Oui'}, {'key': 'B', 'texte': 'Non'}],
            reponse_correcte='A',
            points=2,
            numero_ordre=i,
        )
    return epreuve


@pytest.mark.django_db
class TestSessions:

    def test_demarrer_session_eleve(self, auth_client_eleve):
        epreuve = create_epreuve()
        response = auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {'mode': 'exercice'}, format='json')
        assert response.status_code == 201
        assert response.data['statut'] == 'en_cours'
        assert response.data['nb_questions'] == 3

    def test_demarrer_session_parent_interdit(self, api_client, parent_data):
        reg = api_client.post('/api/v1/auth/register/', parent_data, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {reg.data["tokens"]["access"]}')
        epreuve = create_epreuve()
        response = api_client.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {}, format='json')
        assert response.status_code == 403

    def test_session_deja_en_cours_retourne_200(self, auth_client_eleve):
        epreuve = create_epreuve()
        auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {'mode': 'exercice'}, format='json')
        response = auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {'mode': 'exercice'}, format='json')
        assert response.status_code == 200  # session existante retournée

    def test_soumettre_reponses(self, auth_client_eleve):
        epreuve = create_epreuve()
        session_resp = auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {'mode': 'exercice'}, format='json')
        session_id = session_resp.data['id_session']

        questions = list(Questions.objects.filter(id_epreuve=epreuve).values_list('id_question', flat=True))
        reponses = [{'id_question': str(q), 'contenu_reponse': 'A', 'temps_reponse_sec': 5} for q in questions]

        response = auth_client_eleve.post(f'/api/v1/sessions/{session_id}/reponses/', {'reponses': reponses}, format='json')
        assert response.status_code == 200
        assert '3' in response.data['message']

    def test_terminer_session(self, auth_client_eleve):
        epreuve = create_epreuve()
        session_resp = auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {'mode': 'exercice'}, format='json')
        session_id = session_resp.data['id_session']

        questions = list(Questions.objects.filter(id_epreuve=epreuve).values_list('id_question', flat=True))
        reponses = [{'id_question': str(q), 'contenu_reponse': 'A'} for q in questions]
        auth_client_eleve.post(f'/api/v1/sessions/{session_id}/reponses/', {'reponses': reponses}, format='json')

        response = auth_client_eleve.post(f'/api/v1/sessions/{session_id}/terminer/', {'duree_reelle_sec': 120}, format='json')
        assert response.status_code == 200
        assert response.data['nb_bonnes_reponses'] == 3
        assert response.data['note'] == 20.0
        assert response.data['xp_gagnes'] == 30

    def test_terminer_session_calcule_score_partiel(self, auth_client_eleve):
        epreuve = create_epreuve()
        session_resp = auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {'mode': 'exercice'}, format='json')
        session_id = session_resp.data['id_session']

        questions = list(Questions.objects.filter(id_epreuve=epreuve).values_list('id_question', flat=True))
        # 1 bonne réponse sur 3
        reponses = [
            {'id_question': str(questions[0]), 'contenu_reponse': 'A'},
            {'id_question': str(questions[1]), 'contenu_reponse': 'B'},  # mauvaise
            {'id_question': str(questions[2]), 'contenu_reponse': 'B'},  # mauvaise
        ]
        auth_client_eleve.post(f'/api/v1/sessions/{session_id}/reponses/', {'reponses': reponses}, format='json')

        response = auth_client_eleve.post(f'/api/v1/sessions/{session_id}/terminer/', {}, format='json')
        assert response.status_code == 200
        assert response.data['nb_bonnes_reponses'] == 1
        assert round(response.data['note'], 2) == round(20 / 3, 2)

    def test_historique_sessions(self, auth_client_eleve):
        response = auth_client_eleve.get('/api/v1/sessions/')
        assert response.status_code == 200
        assert 'results' in response.data

    def test_detail_session(self, auth_client_eleve):
        epreuve = create_epreuve()
        session_resp = auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {'mode': 'exercice'}, format='json')
        session_id = session_resp.data['id_session']
        response = auth_client_eleve.get(f'/api/v1/sessions/{session_id}/')
        assert response.status_code == 200
        assert str(response.data['id_session']) == str(session_id)

    def test_terminer_session_deux_fois_retourne_400(self, auth_client_eleve):
        epreuve = create_epreuve()
        session_resp = auth_client_eleve.post(f'/api/v1/epreuves/{epreuve.id_epreuve}/demarrer/', {}, format='json')
        session_id = session_resp.data['id_session']
        auth_client_eleve.post(f'/api/v1/sessions/{session_id}/terminer/', {}, format='json')
        response = auth_client_eleve.post(f'/api/v1/sessions/{session_id}/terminer/', {}, format='json')
        assert response.status_code == 400


@pytest.mark.django_db
class TestDashboard:

    def test_dashboard_eleve(self, auth_client_eleve):
        response = auth_client_eleve.get('/api/v1/analytique/dashboard/')
        assert response.status_code == 200
        assert 'stats_globales' in response.data
        assert 'cours_recents' in response.data
        assert 'sessions_recentes' in response.data
        assert 'badges_recents' in response.data
        assert 'lacunes_actives' in response.data

    def test_dashboard_non_eleve_retourne_403(self, api_client, parent_data):
        reg = api_client.post('/api/v1/auth/register/', parent_data, format='json')
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {reg.data["tokens"]["access"]}')
        response = api_client.get('/api/v1/analytique/dashboard/')
        assert response.status_code == 403

    def test_dashboard_contient_stats(self, auth_client_eleve):
        response = auth_client_eleve.get('/api/v1/analytique/dashboard/')
        stats = response.data['stats_globales']
        assert 'points_gamification' in stats
        assert 'streak_jours' in stats
        assert 'score_global' in stats
        assert 'taux_reussite' in stats
