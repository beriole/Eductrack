"""Notification des élèves d'un niveau à la publication d'un contenu (cours / épreuve)."""
import pytest
from rest_framework.test import APIClient

from school.models import (
    Enseignants, Eleves, Matieres, Cours, Epreuves, Notifications,
)


def register(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    return res.data


PROF = {'email': 'ntf_prof@test.cm', 'password': 'TestPass123!', 'nom': 'P', 'prenom': 'Q',
        'telephone': '+237699090010', 'role': 'enseignant'}
ELEVE_TLE_D = {'email': 'ntf_tle_d@test.cm', 'password': 'TestPass123!', 'nom': 'A', 'prenom': 'B',
               'telephone': '+237699090011', 'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre', 'serie': 'D'}
ELEVE_TLE_C = {'email': 'ntf_tle_c@test.cm', 'password': 'TestPass123!', 'nom': 'C', 'prenom': 'D',
               'telephone': '+237699090012', 'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre', 'serie': 'C'}
ELEVE_1ERE = {'email': 'ntf_1ere@test.cm', 'password': 'TestPass123!', 'nom': 'E', 'prenom': 'F',
              'telephone': '+237699090013', 'role': 'eleve', 'niveau_scolaire': '1ere', 'region': 'Centre', 'serie': 'D'}


@pytest.fixture
def setup(db):
    c = APIClient()
    register(c, PROF)
    prof = Enseignants.objects.get(email=PROF['email'])
    mat = Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle', '1ere'])
    register(c, ELEVE_TLE_D); register(c, ELEVE_TLE_C); register(c, ELEVE_1ERE)
    return prof, mat


def _notifs(email):
    return Notifications.objects.filter(id_utilisateur__email=email, type_notif='nouveau_contenu')


@pytest.mark.django_db
class TestNotificationContenu:

    def test_cours_publie_notifie_le_bon_niveau_et_serie(self, setup):
        prof, mat = setup
        # Cours Tle série D
        cours = Cours.objects.create(id_enseignant=prof, id_matiere=mat, titre='Limites', contenu='...',
                                     niveau='Tle', serie='D', statut='brouillon')
        assert _notifs(ELEVE_TLE_D['email']).count() == 0  # rien tant que brouillon
        cours.statut = 'publie'
        cours.save()
        assert _notifs(ELEVE_TLE_D['email']).count() == 1      # Tle D notifié
        assert _notifs(ELEVE_TLE_C['email']).count() == 0      # autre série : non
        assert _notifs(ELEVE_1ERE['email']).count() == 0       # autre niveau : non

    def test_cours_sans_serie_notifie_tout_le_niveau(self, setup):
        prof, mat = setup
        cours = Cours.objects.create(id_enseignant=prof, id_matiere=mat, titre='Tronc commun', contenu='...',
                                     niveau='Tle', serie=None, statut='publie')
        assert _notifs(ELEVE_TLE_D['email']).count() == 1
        assert _notifs(ELEVE_TLE_C['email']).count() == 1  # toutes séries de Tle
        assert _notifs(ELEVE_1ERE['email']).count() == 0

    def test_pas_de_double_notification(self, setup):
        prof, mat = setup
        cours = Cours.objects.create(id_enseignant=prof, id_matiere=mat, titre='X', contenu='...',
                                     niveau='Tle', serie='D', statut='publie')
        cours.refresh_from_db()
        cours.titre = 'X modifié'
        cours.save()  # re-save d'un cours déjà publié → pas de nouvelle notif
        assert _notifs(ELEVE_TLE_D['email']).count() == 1
        assert cours.notif_publication_envoyee is True

    def test_epreuve_enseignant_notifie(self, setup):
        prof, mat = setup
        Epreuves.objects.create(id_enseignant=prof, id_matiere=mat, titre='Annale 2024',
                                type_epreuve='officielle', niveau='Tle', serie='D', annee=2024, statut='actif')
        assert _notifs(ELEVE_TLE_D['email']).count() == 1
        assert _notifs(ELEVE_1ERE['email']).count() == 0

    def test_epreuve_auto_generee_ne_notifie_pas(self, setup):
        prof, mat = setup
        # Sans enseignant = contenu auto-généré (révision, orientation, IA) → aucune notif
        Epreuves.objects.create(id_enseignant=None, id_matiere=mat, titre='Révision du jour',
                                type_epreuve='exercice', niveau='Tle', serie='D', statut='actif')
        assert _notifs(ELEVE_TLE_D['email']).count() == 0

    def test_notification_visible_dans_la_cloche(self, setup):
        prof, mat = setup
        Cours.objects.create(id_enseignant=prof, id_matiere=mat, titre='Dérivées', contenu='...',
                             niveau='Tle', serie='D', statut='publie')
        ce = APIClient()
        res = ce.post('/api/v1/auth/login/', {'email': ELEVE_TLE_D['email'], 'password': ELEVE_TLE_D['password']}, format='json')
        ce.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
        liste = ce.get('/api/v1/notifications/')
        items = liste.data.get('results', liste.data)
        assert any(n['type_notif'] == 'nouveau_contenu' and 'Dérivées' in n['message'] for n in items)
