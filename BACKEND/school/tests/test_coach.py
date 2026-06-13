"""Tests Module 10 — Coach IA (conseils personnalisés + tâche quotidienne)."""
import datetime
import pytest
from rest_framework.test import APIClient

from school.models import (
    Eleves, Matieres, Epreuves, SessionsExamen, Lacunes, Notifications,
)
from school.api_views import coach_views


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'coach_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Fotso', 'prenom': 'Bea', 'telephone': '+237699400010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Ouest',
}
ENSEIGNANT = {
    'email': 'coach_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Kana', 'prenom': 'Luc', 'telephone': '+237699400011',
    'role': 'enseignant',
}


def _force_fallback(monkeypatch):
    def ko(*a, **k):
        raise coach_views.ai_service.AIUnavailable("pas de clé")
    monkeypatch.setattr(coach_views.ai_service, 'generate', ko)


@pytest.mark.django_db
class TestCoachConseil:

    def test_authentification_requise(self):
        c = APIClient()
        res = c.get('/api/v1/coach/conseil/')
        assert res.status_code == 401

    def test_enseignant_interdit(self):
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        res = c.get('/api/v1/coach/conseil/')
        assert res.status_code == 403

    def test_conseil_ia(self, monkeypatch):
        monkeypatch.setattr(coach_views.ai_service, 'generate',
                            lambda *a, **k: "Allez Bea, une session aujourd'hui !")
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/coach/conseil/')
        assert res.status_code == 200
        assert res.data['source'] == 'ia'
        assert res.data['message'] == "Allez Bea, une session aujourd'hui !"
        assert 'contexte' in res.data

    def test_conseil_fallback_nouvel_eleve(self, monkeypatch):
        _force_fallback(monkeypatch)
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/coach/conseil/')
        assert res.status_code == 200
        assert res.data['source'] == 'fallback'
        # Nouvel élève : message de bienvenue + prénom.
        assert res.data['contexte']['jamais_actif'] is True
        assert 'Bea' in res.data['message']

    def test_conseil_ne_cree_pas_de_notification(self, monkeypatch):
        _force_fallback(monkeypatch)
        c = APIClient()
        register_and_auth(c, ELEVE)
        c.get('/api/v1/coach/conseil/')
        eleve = Eleves.objects.get(email=ELEVE['email'])
        assert Notifications.objects.filter(id_utilisateur=eleve).count() == 0


@pytest.mark.django_db
class TestContexteEtFallback:

    def _eleve(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        return Eleves.objects.get(email=ELEVE['email'])

    def test_fallback_cible_la_lacune(self, monkeypatch):
        _force_fallback(monkeypatch)
        eleve = self._eleve()
        matiere = Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])
        # Une activité récente pour ne pas tomber dans « nouveau » / « inactif ».
        epreuve = Epreuves.objects.create(
            id_matiere=matiere, titre='E', type_epreuve='exercice', niveau='Tle')
        from django.utils import timezone
        SessionsExamen.objects.create(
            id_eleve=eleve, id_epreuve=epreuve, statut='termine',
            date_fin=timezone.now(), note_obtenue=12.0, nb_questions=5, nb_bonnes_reponses=3)
        Lacunes.objects.create(
            id_eleve=eleve, id_matiere=matiere, chapitre='Analyse',
            notion='Limites', taux_maitrise=30, statut='detectee')

        titre, message, source, ctx = coach_views.generer_conseil_coach(eleve)
        assert source == 'fallback'
        assert ctx['lacune_notion'] == 'Limites'
        assert 'Limites' in message

    def test_contexte_compte_sessions_recentes(self, monkeypatch):
        _force_fallback(monkeypatch)
        eleve = self._eleve()
        matiere = Matieres.objects.create(code='PHY', nom='Physique', niveaux=['Tle'])
        epreuve = Epreuves.objects.create(
            id_matiere=matiere, titre='E', type_epreuve='exercice', niveau='Tle')
        from django.utils import timezone
        for note in (10.0, 14.0):
            SessionsExamen.objects.create(
                id_eleve=eleve, id_epreuve=epreuve, statut='termine',
                date_fin=timezone.now(), note_obtenue=note, nb_questions=5, nb_bonnes_reponses=3)

        ctx = coach_views.construire_contexte(eleve)
        assert ctx['nb_sessions_7j'] == 2
        assert ctx['moyenne_recente'] == 12.0
        assert ctx['jamais_actif'] is False


@pytest.mark.django_db
class TestTacheCoaching:

    def test_tache_cree_une_notif_par_eleve(self, monkeypatch):
        _force_fallback(monkeypatch)
        c = APIClient()
        register_and_auth(c, ELEVE)
        eleve = Eleves.objects.get(email=ELEVE['email'])

        from school.tasks import coacher_eleves
        res1 = coacher_eleves()
        assert Notifications.objects.filter(id_utilisateur=eleve, type_notif='coach').count() == 1
        assert '1 message' in res1

        # Deuxième passage le même jour : pas de doublon.
        res2 = coacher_eleves()
        assert Notifications.objects.filter(id_utilisateur=eleve, type_notif='coach').count() == 1
        assert '0 message' in res2
