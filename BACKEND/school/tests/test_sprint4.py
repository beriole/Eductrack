"""Tests Sprint 4 — Paiements Fapshi, Abonnements, Planning d'étude."""
import pytest
import datetime
from unittest.mock import patch
from rest_framework.test import APIClient
from school.models import Abonnements, Paiements, PlanningsEtude, SessionsEtude, Matieres, Eleves, Utilisateur, Lacunes

# ─── Helpers ──────────────────────────────────────────────────────────────────

def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 's4_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Fon', 'prenom': 'Eric', 'telephone': '+237699100010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Littoral',
}

PARENT = {
    'email': 's4_parent@test.cm', 'password': 'TestPass123!',
    'nom': 'Fon', 'prenom': 'Rose', 'telephone': '+237699100011',
    'role': 'parent',
}


def make_matiere(code='MATH4', nom='Mathématiques S4'):
    return Matieres.objects.get_or_create(
        code=code,
        defaults={'nom': nom, 'niveaux': ['Tle'], 'actif': True},
    )[0]


# ─── Abonnements (sans appel Fapshi réel) ─────────────────────────────────────

@pytest.mark.django_db
class TestAbonnements:

    def test_abonnement_actif_vide(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/abonnements/actif/')
        assert res.status_code == 200
        assert res.data['abonnement'] is None
        assert res.data['formule'] == 'basic'

    def test_liste_abonnements_vide(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/abonnements/')
        assert res.status_code == 200
        results = res.data.get('results', res.data)
        assert results == []

    def test_initier_paiement_sans_telephone(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_nophone@test.cm', 'telephone': '+237699100012'})
        res = c.post('/api/v1/paiements/initier/', {'formule': 'standard', 'periodicite': 'mensuel'}, format='json')
        assert res.status_code == 400

    def test_initier_paiement_formule_invalide(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_badf@test.cm', 'telephone': '+237699100013'})
        res = c.post('/api/v1/paiements/initier/', {
            'formule': 'inexistante', 'periodicite': 'mensuel', 'phone': '+237699100013'
        }, format='json')
        assert res.status_code == 400

    def test_initier_paiement_basic_gratuit(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_basic@test.cm', 'telephone': '+237699100014'})
        res = c.post('/api/v1/paiements/initier/', {
            'formule': 'basic', 'periodicite': 'mensuel', 'phone': '+237699100014'
        }, format='json')
        assert res.status_code == 400  # basic est gratuit

    def test_initier_paiement_mode_test(self):
        """Quand FAPSHI_API_USER est configuré mais pas en prod → mode test."""
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_pay@test.cm', 'telephone': '+237699100015'})
        with patch('school.api_views.payment_views._initiate_fapshi_payment') as mock_fapshi:
            mock_fapshi.return_value = {'transId': 'TX-TEST-001', 'link': 'https://pay.test/TX-TEST-001'}
            res = c.post('/api/v1/paiements/initier/', {
                'formule': 'standard', 'periodicite': 'mensuel', 'phone': '+237699100015'
            }, format='json')
        assert res.status_code == 200
        assert 'trans_id' in res.data

    def test_abonnement_actif_apres_confirmation(self):
        """Simule un abonnement actif créé directement en base."""
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_actif@test.cm', 'telephone': '+237699100016'})
        user = Utilisateur.objects.get(email='s4_actif@test.cm')
        today = datetime.date.today()
        Abonnements.objects.create(
            id_utilisateur=user,
            formule='premium',
            montant=5000,
            periodicite='mensuel',
            date_debut=today,
            date_expiration=today + datetime.timedelta(days=30),
            statut='actif',
        )
        res = c.get('/api/v1/abonnements/actif/')
        assert res.status_code == 200
        assert res.data['formule'] == 'premium'
        assert res.data['abonnement'] is not None


# ─── Planning d'étude ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPlanning:

    def test_planning_actif_vide(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_plan0@test.cm', 'telephone': '+237699100020'})
        res = c.get('/api/v1/plannings/actif/')
        assert res.status_code == 200
        assert res.data['planning'] is None
        assert res.data['sessions'] == []

    def test_creer_planning(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_plan1@test.cm', 'telephone': '+237699100021'})
        make_matiere('MATH4', 'Mathématiques')
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        res = c.post('/api/v1/plannings/creer/', {
            'semaine_debut': semaine,
            'disponibilites': {
                'lundi':  ['18:00', '20:00'],
                'mercredi': ['14:00', '17:00'],
                'samedi': ['09:00', '12:00'],
            },
            'priorites_matieres': ['MATH4'],
        }, format='json')
        assert res.status_code == 201
        assert 'planning' in res.data
        assert len(res.data['sessions']) == 3  # 3 créneaux

    def test_planning_actif_apres_creation(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_plan2@test.cm', 'telephone': '+237699100022'})
        make_matiere('PHY4', 'Physique')
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        c.post('/api/v1/plannings/creer/', {
            'semaine_debut': semaine,
            'disponibilites': {'mardi': ['17:00', '19:00']},
            'priorites_matieres': ['PHY4'],
        }, format='json')
        res = c.get('/api/v1/plannings/actif/')
        assert res.status_code == 200
        assert res.data['planning'] is not None
        assert res.data['planning']['actif'] is True

    def test_completer_session(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_plan3@test.cm', 'telephone': '+237699100023'})
        make_matiere('SVT4', 'SVT')
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        create_res = c.post('/api/v1/plannings/creer/', {
            'semaine_debut': semaine,
            'disponibilites': {'jeudi': ['15:00', '17:00']},
            'priorites_matieres': ['SVT4'],
        }, format='json')
        assert create_res.status_code == 201
        sessions = create_res.data['sessions']
        assert len(sessions) >= 1
        session_id = sessions[0]['id_session_etude']
        res = c.post(f'/api/v1/plannings/sessions/{session_id}/completer/')
        assert res.status_code == 200
        assert res.data['completee'] is True
        assert res.data['xp_gagne'] >= 5

    def test_parent_ne_peut_pas_creer_planning(self):
        c = APIClient()
        register_and_auth(c, {**PARENT, 'email': 's4_pplan@test.cm', 'telephone': '+237699100024'})
        res = c.post('/api/v1/plannings/creer/', {}, format='json')
        assert res.status_code == 403

    def test_nouveau_planning_desactive_lancien(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_plan4@test.cm', 'telephone': '+237699100025'})
        make_matiere('HIS4', 'Histoire')
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        payload = {
            'semaine_debut': semaine,
            'disponibilites': {'vendredi': ['18:00', '20:00']},
            'priorites_matieres': ['HIS4'],
        }
        c.post('/api/v1/plannings/creer/', payload, format='json')
        c.post('/api/v1/plannings/creer/', payload, format='json')
        user = Utilisateur.objects.get(email='s4_plan4@test.cm')
        eleve = Eleves.objects.get(id_utilisateur=user.id_utilisateur)
        assert PlanningsEtude.objects.filter(id_eleve=eleve, actif=True).count() == 1

    def test_liste_plannings(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_plan5@test.cm', 'telephone': '+237699100026'})
        make_matiere('GEO4', 'Géographie')
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        c.post('/api/v1/plannings/creer/', {
            'semaine_debut': semaine,
            'disponibilites': {'samedi': ['10:00', '12:00']},
            'priorites_matieres': ['GEO4'],
        }, format='json')
        res = c.get('/api/v1/plannings/')
        assert res.status_code == 200
        results = res.data.get('results', res.data)
        assert len(results) >= 1


@pytest.mark.django_db
class TestPlanningIntelligent:
    """Planning pédagogique : 2-3 matières/jour, priorité aux faiblesses, contexte camerounais."""

    def _matieres_tle(self):
        return [
            Matieres.objects.get_or_create(code=c, defaults={'nom': n, 'niveaux': ['Tle'], 'actif': True})[0]
            for c, n in [('MATHX', 'Maths'), ('PHYX', 'Physique'), ('SVTX', 'SVT'), ('HISX', 'Histoire')]
        ]

    def test_deux_a_trois_matieres_par_jour(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_pi1@test.cm', 'telephone': '+237699100030'})
        self._matieres_tle()
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        res = c.post('/api/v1/plannings/creer/', {
            'semaine_debut': semaine,
            'disponibilites': {
                'mercredi': ['14:00', '17:00'],  # 180 min ≥ 150 → 3 matières
                'lundi':    ['18:00', '20:00'],  # 120 min → 2 matières
            },
        }, format='json')
        assert res.status_code == 201, res.data
        sessions = res.data['sessions']
        # Regroupe par jour calendaire.
        par_jour = {}
        for s in sessions:
            jour = s['date_heure'][:10]
            par_jour.setdefault(jour, []).append(s)
        for jour, items in par_jour.items():
            assert 2 <= len(items) <= 3, f"{jour}: {len(items)} sessions"
            # Pas deux fois la même matière le même jour.
            codes = [s['matiere_code'] for s in items]
            assert len(codes) == len(set(codes)), f"doublon de matière le {jour}"

    def test_priorite_aux_lacunes(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_pi2@test.cm', 'telephone': '+237699100031'})
        matieres = self._matieres_tle()
        user = Utilisateur.objects.get(email='s4_pi2@test.cm')
        eleve = Eleves.objects.get(id_utilisateur=user.id_utilisateur)
        # Lacune sévère sur les maths → doit être renforcée en priorité.
        Lacunes.objects.create(
            id_eleve=eleve, id_matiere=matieres[0], chapitre='Limites et continuité',
            notion='Limites', taux_maitrise=20, statut='detectee',
        )
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        res = c.post('/api/v1/plannings/creer/', {'semaine_debut': semaine, 'mode': 'auto'}, format='json')
        assert res.status_code == 201, res.data
        sessions = res.data['sessions']
        # La matière à lacune apparaît au moins autant que n'importe quelle autre.
        from collections import Counter
        compte = Counter(s['matiere_code'] for s in sessions)
        assert compte['MATHX'] == max(compte.values())
        # Et son objectif cible explicitement le chapitre faible.
        assert any(s['matiere_code'] == 'MATHX' and s['objectif'].startswith('Renforcer :') for s in sessions)

    def test_contexte_camerounais_auto(self):
        c = APIClient()
        register_and_auth(c, {**ELEVE, 'email': 's4_pi3@test.cm', 'telephone': '+237699100032'})
        self._matieres_tle()
        semaine = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
        res = c.post('/api/v1/plannings/creer/', {'semaine_debut': semaine, 'mode': 'auto'}, format='json')
        assert res.status_code == 201, res.data
        # Le calendrier auto couvre les 7 jours ; chaque jour respecte 2-3 matières.
        par_jour = {}
        for s in res.data['sessions']:
            par_jour.setdefault(s['date_heure'][:10], []).append(s)
        assert len(par_jour) == 7  # lundi → dimanche
        for items in par_jour.values():
            assert 2 <= len(items) <= 3
        # Mercredi (après-midi long) doit proposer 3 matières.
        mercredi = (datetime.date.fromisoformat(semaine) + datetime.timedelta(days=2)).isoformat()
        assert len(par_jour[mercredi]) == 3
