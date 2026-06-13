"""Tests Module 12 — Gamification avancée (ligues + défis)."""
import datetime
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from school.models import (
    Eleves, Matieres, Epreuves, Questions, SessionsExamen, Defis, EleveDefis,
)
from school import gamification_engine as ge


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 'gam_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Sona', 'prenom': 'Ruth', 'telephone': '+237699800010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


def _client_eleve():
    c = APIClient()
    register_and_auth(c, ELEVE)
    return c, Eleves.objects.get(email=ELEVE['email'])


def _sessions_terminees(eleve, n, note=12.0, quand=None):
    matiere = Matieres.objects.create(code=f'M{random_code()}', nom='Mat', niveaux=['Tle'])
    epreuve = Epreuves.objects.create(id_matiere=matiere, titre='E', type_epreuve='exercice', niveau='Tle')
    for _ in range(n):
        SessionsExamen.objects.create(
            id_eleve=eleve, id_epreuve=epreuve, statut='termine',
            date_fin=quand or timezone.now(), note_obtenue=note, nb_questions=5, nb_bonnes_reponses=3)


_counter = [0]
def random_code():
    _counter[0] += 1
    return str(_counter[0])


@pytest.mark.django_db
class TestLigue:

    def test_info_ligue_bronze_a_or(self):
        assert ge.info_ligue(0)['nom'] == 'Bronze'
        assert ge.info_ligue(50)['nom'] == 'Bronze'
        assert ge.info_ligue(100)['nom'] == 'Argent'
        assert ge.info_ligue(600)['nom'] == 'Or'
        assert ge.info_ligue(5000)['nom'] == 'Diamant'

    def test_progression_vers_suivante(self):
        info = ge.info_ligue(300)  # Argent (100), suivant Or (500)
        assert info['nom'] == 'Argent'
        assert info['ligue_suivante'] == 'Or'
        assert info['xp_manquant'] == 200
        assert 0 < info['progression'] < 100

    def test_endpoint_ligue(self):
        c, eleve = _client_eleve()
        eleve.points_gamification = 120
        eleve.save(update_fields=['points_gamification'])
        res = c.get('/api/v1/gamification/ligue/')
        assert res.status_code == 200
        assert res.data['nom'] == 'Argent'


@pytest.mark.django_db
class TestDefis:

    def test_progression_calculee_sur_donnees_reelles(self):
        c, eleve = _client_eleve()
        Defis.objects.create(
            code='sess3', titre='3 sessions', description='...', type_cible='sessions_semaine',
            seuil=3, recompense_xp=60, periode='hebdomadaire')
        _sessions_terminees(eleve, 2)

        res = c.get('/api/v1/gamification/defis/')
        assert res.status_code == 200
        defi = next(d for d in res.data['defis'] if d['code'] == 'sess3')
        assert defi['progression_reelle'] == 2
        assert defi['complete'] is False

    def test_completion_et_reclamation_credite_xp(self):
        c, eleve = _client_eleve()
        eleve.points_gamification = 10
        eleve.save(update_fields=['points_gamification'])
        Defis.objects.create(
            code='sess3', titre='3 sessions', description='...', type_cible='sessions_semaine',
            seuil=3, recompense_xp=60, periode='hebdomadaire')
        _sessions_terminees(eleve, 3)

        liste = c.get('/api/v1/gamification/defis/')
        defi = next(d for d in liste.data['defis'] if d['code'] == 'sess3')
        assert defi['complete'] is True
        assert defi['recompense_reclamee'] is False

        res = c.post('/api/v1/gamification/defis/sess3/reclamer/')
        assert res.status_code == 200
        assert res.data['xp_gagne'] == 60
        eleve.refresh_from_db()
        assert eleve.points_gamification == 70

    def test_reclamation_double_refusee(self):
        c, eleve = _client_eleve()
        Defis.objects.create(
            code='streak7', titre='Série', description='...', type_cible='streak',
            seuil=1, recompense_xp=100, periode='permanent')
        eleve.streak_jours = 5
        eleve.save(update_fields=['streak_jours'])

        first = c.post('/api/v1/gamification/defis/streak7/reclamer/')
        assert first.status_code == 200
        second = c.post('/api/v1/gamification/defis/streak7/reclamer/')
        assert second.status_code == 400

    def test_reclamation_defi_non_complete_refusee(self):
        c, eleve = _client_eleve()
        Defis.objects.create(
            code='exo20', titre='20 exos', description='...', type_cible='exercices_total',
            seuil=20, recompense_xp=120, periode='permanent')
        res = c.post('/api/v1/gamification/defis/exo20/reclamer/')
        assert res.status_code == 400
