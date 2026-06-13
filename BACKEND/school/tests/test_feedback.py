"""Avis (notes/commentaires), favoris, et retours agrégés enseignant (Phase 4)."""
import pytest
from rest_framework.test import APIClient

from school.models import Enseignants, Matieres, Cours, Epreuves, Avis, Favori


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


PROF = {'email': 'fb_prof@test.cm', 'password': 'TestPass123!', 'nom': 'A', 'prenom': 'B',
        'telephone': '+237699080010', 'role': 'enseignant'}
ELEVE = {'email': 'fb_eleve@test.cm', 'password': 'TestPass123!', 'nom': 'C', 'prenom': 'D',
         'telephone': '+237699080011', 'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre'}
ELEVE2 = {'email': 'fb_eleve2@test.cm', 'password': 'TestPass123!', 'nom': 'E', 'prenom': 'F',
          'telephone': '+237699080012', 'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre'}


@pytest.fixture
def setup(db):
    cp = APIClient(); register_and_auth(cp, PROF)
    prof = Enseignants.objects.get(email=PROF['email'])
    mat = Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])
    cours = Cours.objects.create(id_enseignant=prof, id_matiere=mat, titre='Les limites', contenu='...', niveau='Tle', statut='publie')
    ep = Epreuves.objects.create(id_enseignant=prof, id_matiere=mat, titre='Annale 2023', type_epreuve='officielle', niveau='Tle', annee=2023, statut='actif')
    ce = APIClient(); register_and_auth(ce, ELEVE)
    return {'cp': cp, 'prof': prof, 'mat': mat, 'cours': cours, 'ep': ep, 'ce': ce}


@pytest.mark.django_db
class TestAvis:

    def test_eleve_note_un_cours(self, setup):
        ce, cours = setup['ce'], setup['cours']
        res = ce.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 5, 'commentaire': 'Super clair !'}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['note'] == 5
        assert Avis.objects.filter(id_cours=cours).count() == 1

    def test_re_noter_met_a_jour_sans_doublon(self, setup):
        ce, cours = setup['ce'], setup['cours']
        ce.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 3}, format='json')
        res = ce.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 5}, format='json')
        assert res.status_code == 200
        assert Avis.objects.filter(id_cours=cours).count() == 1
        assert Avis.objects.get(id_cours=cours).note == 5

    def test_note_hors_bornes_rejetee(self, setup):
        ce, cours = setup['ce'], setup['cours']
        res = ce.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 9}, format='json')
        assert res.status_code == 400

    def test_cible_exclusive_obligatoire(self, setup):
        ce, cours, ep = setup['ce'], setup['cours'], setup['ep']
        res = ce.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'id_epreuve': str(ep.id_epreuve), 'note': 4}, format='json')
        assert res.status_code == 400

    def test_liste_avis_avec_moyenne(self, setup):
        cours = setup['cours']
        setup['ce'].post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 4, 'commentaire': 'Bien'}, format='json')
        ce2 = APIClient(); register_and_auth(ce2, ELEVE2)
        ce2.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 2}, format='json')
        res = setup['ce'].get(f'/api/v1/avis/?id_cours={cours.id_cours}')
        assert res.status_code == 200
        assert res.data['nb_avis'] == 2
        assert res.data['note_moyenne'] == 3.0

    def test_cours_detail_expose_agregats(self, setup):
        ce, cours = setup['ce'], setup['cours']
        ce.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 5}, format='json')
        res = ce.get(f'/api/v1/cours/{cours.id_cours}/')
        assert res.status_code == 200
        assert res.data['note_moyenne'] == 5.0
        assert res.data['nb_avis'] == 1
        assert res.data['mon_avis'] == {'note': 5, 'commentaire': None}


@pytest.mark.django_db
class TestFavoris:

    def test_toggle_ajoute_puis_retire(self, setup):
        ce, ep = setup['ce'], setup['ep']
        r1 = ce.post('/api/v1/favoris/toggle/', {'id_epreuve': str(ep.id_epreuve)}, format='json')
        assert r1.status_code == 201 and r1.data['est_favori'] is True
        r2 = ce.post('/api/v1/favoris/toggle/', {'id_epreuve': str(ep.id_epreuve)}, format='json')
        assert r2.status_code == 200 and r2.data['est_favori'] is False
        assert Favori.objects.count() == 0

    def test_liste_favoris(self, setup):
        ce, cours = setup['ce'], setup['cours']
        ce.post('/api/v1/favoris/toggle/', {'id_cours': str(cours.id_cours)}, format='json')
        res = ce.get('/api/v1/favoris/')
        assert res.status_code == 200
        assert len(res.data) == 1
        assert res.data[0]['type_contenu'] == 'cours'
        assert res.data[0]['contenu_titre'] == 'Les limites'

    def test_cours_detail_est_favori(self, setup):
        ce, cours = setup['ce'], setup['cours']
        ce.post('/api/v1/favoris/toggle/', {'id_cours': str(cours.id_cours)}, format='json')
        res = ce.get(f'/api/v1/cours/{cours.id_cours}/')
        assert res.data['est_favori'] is True


@pytest.mark.django_db
class TestRetoursEnseignant:

    def test_retours_agreges(self, setup):
        cp, ce, cours, ep = setup['cp'], setup['ce'], setup['cours'], setup['ep']
        ce.post('/api/v1/avis/', {'id_cours': str(cours.id_cours), 'note': 4, 'commentaire': 'Très utile'}, format='json')
        ce.post('/api/v1/favoris/toggle/', {'id_epreuve': str(ep.id_epreuve)}, format='json')
        res = cp.get('/api/v1/enseignant/retours/')
        assert res.status_code == 200, res.data
        assert res.data['resume']['nb_avis'] == 1
        assert res.data['resume']['nb_favoris'] == 1
        assert res.data['resume']['note_moyenne_globale'] == 4.0
        assert len(res.data['contenus']) == 2
        assert any(c['commentaire'] == 'Très utile' for c in res.data['derniers_commentaires'])

    def test_eleve_n_a_pas_acces_aux_retours(self, setup):
        res = setup['ce'].get('/api/v1/enseignant/retours/')
        assert res.status_code == 403
