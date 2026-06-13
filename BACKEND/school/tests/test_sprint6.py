"""Tests Sprint 6 — Atelier rédaction, Concours, Rapport parental réel."""
import datetime
import pytest
from rest_framework.test import APIClient

from school.models import (
    Eleves, Parents, EleveParent, Matieres, Epreuves, SessionsExamen, Lacunes,
)


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ELEVE = {
    'email': 's6_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'Eyong', 'prenom': 'Sandra', 'telephone': '+237699200010',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Sud-Ouest',
}
PARENT = {
    'email': 's6_parent@test.cm', 'password': 'TestPass123!',
    'nom': 'Eyong', 'prenom': 'Paul', 'telephone': '+237699200011',
    'role': 'parent',
}


# ─── Atelier rédaction ────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestRedaction:

    def test_texte_trop_court_retourne_400(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.post('/api/v1/redaction/analyser/', {'texte': 'Trop court'}, format='json')
        assert res.status_code == 400

    def test_analyse_retourne_score_et_stats(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        texte = (
            "Le sport est essentiel pour la jeunesse camerounaise. "
            "D'abord, il renforce le corps et la santé physique. "
            "Ensuite, il forge le mental et la discipline. "
            "Cependant, il faut de la rigueur et de la régularité. "
            "En conclusion, le sport est un pilier du développement de tout élève."
        )
        res = c.post('/api/v1/redaction/analyser/',
                     {'texte': texte, 'type_exercice': 'dissertation'}, format='json')
        assert res.status_code == 200
        assert 0 <= res.data['score'] <= 100
        assert res.data['statistiques']['nb_mots'] > 0
        assert 'suggestions' in res.data
        assert res.data['type_exercice'] == 'dissertation'

    def test_type_invalide_bascule_sur_redaction(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.post('/api/v1/redaction/analyser/',
                     {'texte': 'Ceci est un texte de test suffisamment long pour analyse.',
                      'type_exercice': 'inconnu'}, format='json')
        assert res.status_code == 200
        assert res.data['type_exercice'] == 'redaction'

    def test_connecteurs_augmentent_le_score(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        sans = "Le chat dort. Le chat mange. Le chat joue. Le chat dort encore beaucoup."
        avec = ("D'abord le chat dort. Ensuite il mange. Cependant il joue. "
                "Par conséquent il est fatigué. En conclusion il dort encore.")
        r1 = c.post('/api/v1/redaction/analyser/', {'texte': sans}, format='json')
        r2 = c.post('/api/v1/redaction/analyser/', {'texte': avec}, format='json')
        assert r2.data['score'] >= r1.data['score']

    def test_authentification_requise(self):
        c = APIClient()
        res = c.post('/api/v1/redaction/analyser/', {'texte': 'x' * 30}, format='json')
        assert res.status_code == 401


# ─── Concours ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestConcours:

    def test_liste_concours(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/concours/')
        assert res.status_code == 200
        assert len(res.data['concours']) >= 4
        assert 'categories' in res.data
        codes = [x['code'] for x in res.data['concours']]
        assert 'ENS' in codes and 'ENAM' in codes

    def test_filtre_par_categorie(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.get('/api/v1/concours/', {'categorie': 'Santé'})
        assert res.status_code == 200
        assert all(x['categorie'] == 'Santé' for x in res.data['concours'])

    def test_authentification_requise(self):
        c = APIClient()
        res = c.get('/api/v1/concours/')
        assert res.status_code == 401


# ─── Rapport parental sur données réelles ─────────────────────────────────────

@pytest.mark.django_db
class TestRapportReel:

    def _lier(self, c_parent):
        eleve_client = APIClient()
        reg = register_and_auth(eleve_client, ELEVE)
        eleve = Eleves.objects.get(email=ELEVE['email'])
        parent_data = register_and_auth(c_parent, PARENT)
        parent = Parents.objects.get(email=PARENT['email'])
        EleveParent.objects.create(id_eleve=eleve, id_parent=parent)
        return eleve, parent

    def test_rapport_calcule_vraies_donnees(self):
        c = APIClient()
        eleve, parent = self._lier(c)

        # Une session d'examen terminée récente
        matiere = Matieres.objects.create(code='MAT6', nom='Maths S6', niveaux=['Tle'])
        epreuve = Epreuves.objects.create(
            id_matiere=matiere, titre='Test S6', type_epreuve='simulation', niveau='Tle')
        from django.utils import timezone
        SessionsExamen.objects.create(
            id_eleve=eleve, id_epreuve=epreuve, statut='termine',
            date_fin=timezone.now() - datetime.timedelta(days=1),
            duree_reelle_sec=3600, note_obtenue=15.0, nb_questions=5, nb_bonnes_reponses=4,
        )
        Lacunes.objects.create(
            id_eleve=eleve, id_matiere=matiere, chapitre='Analyse',
            notion='Limites', taux_maitrise=40, statut='detectee')

        res = c.post('/api/v1/parents/rapports/generer/',
                     {'enfant_id': str(eleve.id_utilisateur)}, format='json')
        assert res.status_code == 201, res.data
        rapport = res.data['rapport']
        assert rapport['nb_sessions'] == 1
        assert float(rapport['moyenne_globale']) == 15.0
        assert 'Maths S6' in rapport['matieres_travaillees']
        assert any('Limites' in l for l in rapport['lacunes_principales'])

    def test_rapport_sans_activite_reste_coherent(self):
        c = APIClient()
        eleve, parent = self._lier(c)
        res = c.post('/api/v1/parents/rapports/generer/',
                     {'enfant_id': str(eleve.id_utilisateur)}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['rapport']['nb_sessions'] == 0
