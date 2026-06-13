"""Téléversement de PDF (cours / épreuves) par l'enseignant + consultation élève."""
import io
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from school.models import Enseignants, Eleves, Matieres, Cours, Epreuves


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


PROF = {
    'email': 'pdf_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Eboa', 'prenom': 'Max', 'telephone': '+237699070010', 'role': 'enseignant',
}
PROF2 = {
    'email': 'pdf_prof2@test.cm', 'password': 'TestPass123!',
    'nom': 'Z', 'prenom': 'W', 'telephone': '+237699070011', 'role': 'enseignant',
}
ELEVE = {
    'email': 'pdf_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'X', 'prenom': 'Y', 'telephone': '+237699070012',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


def _pdf(name='doc.pdf'):
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, 'Contenu PDF de test')
    c.showPage(); c.save(); buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='application/pdf')


@pytest.fixture
def setup(db):
    c = APIClient(); register_and_auth(c, PROF)
    prof = Enseignants.objects.get(email=PROF['email'])
    matiere = Matieres.objects.create(code='MATH', nom='Mathématiques', niveaux=['Tle'])
    return c, prof, matiere


@pytest.mark.django_db
class TestPdfUpload:

    def test_attacher_pdf_a_un_cours(self, setup):
        c, prof, matiere = setup
        cours = Cours.objects.create(id_enseignant=prof, id_matiere=matiere, titre='C', contenu='...', niveau='Tle', statut='publie')
        res = c.post(f'/api/v1/enseignant/cours/{cours.id_cours}/pdf/', {'fichier': _pdf()}, format='multipart')
        assert res.status_code == 200, res.data
        assert res.data['fichier_pdf']  # URL renvoyée
        cours.refresh_from_db()
        assert cours.fichier_pdf

    def test_attacher_pdf_a_une_epreuve(self, setup):
        c, prof, matiere = setup
        ep = Epreuves.objects.create(id_enseignant=prof, id_matiere=matiere, titre='Annale', type_epreuve='officielle', niveau='Tle', annee=2023)
        res = c.post(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/pdf/', {'fichier': _pdf('annale.pdf')}, format='multipart')
        assert res.status_code == 200, res.data
        assert res.data['fichier_pdf']
        ep.refresh_from_db()
        assert ep.fichier_pdf

    def test_refuse_non_pdf(self, setup):
        c, prof, matiere = setup
        cours = Cours.objects.create(id_enseignant=prof, id_matiere=matiere, titre='C', contenu='...', niveau='Tle')
        bad = SimpleUploadedFile('x.txt', b'pas pdf', content_type='text/plain')
        res = c.post(f'/api/v1/enseignant/cours/{cours.id_cours}/pdf/', {'fichier': bad}, format='multipart')
        assert res.status_code == 400

    def test_ne_televerse_pas_sur_cours_d_autrui(self, setup):
        c, prof, matiere = setup
        cours = Cours.objects.create(id_enseignant=prof, id_matiere=matiere, titre='C', contenu='...', niveau='Tle')
        c2 = APIClient(); register_and_auth(c2, PROF2)
        res = c2.post(f'/api/v1/enseignant/cours/{cours.id_cours}/pdf/', {'fichier': _pdf()}, format='multipart')
        assert res.status_code == 404

    def test_eleve_voit_le_pdf_du_cours(self, setup):
        c, prof, matiere = setup
        cours = Cours.objects.create(id_enseignant=prof, id_matiere=matiere, titre='C', contenu='...', niveau='Tle', statut='publie')
        c.post(f'/api/v1/enseignant/cours/{cours.id_cours}/pdf/', {'fichier': _pdf()}, format='multipart')
        ce = APIClient(); register_and_auth(ce, ELEVE)
        res = ce.get(f'/api/v1/cours/{cours.id_cours}/')
        assert res.status_code == 200
        assert res.data['fichier_pdf'] and res.data['fichier_pdf'].startswith('http')

    def test_eleve_voit_le_pdf_de_l_epreuve_dans_le_catalogue(self, setup):
        c, prof, matiere = setup
        ep = Epreuves.objects.create(id_enseignant=prof, id_matiere=matiere, titre='Annale', type_epreuve='officielle', niveau='Tle', annee=2023, statut='actif')
        c.post(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/pdf/', {'fichier': _pdf('a.pdf')}, format='multipart')
        ce = APIClient(); register_and_auth(ce, ELEVE)
        res = ce.get('/api/v1/epreuves/')
        items = res.data.get('results', res.data)
        cible = next((e for e in items if e['id_epreuve'] == str(ep.id_epreuve)), None)
        assert cible and cible['fichier_pdf'] and cible['fichier_pdf'].startswith('http')

    def test_importer_un_corrige_pdf(self, setup):
        c, prof, matiere = setup
        ep = Epreuves.objects.create(id_enseignant=prof, id_matiere=matiere, titre='Annale', type_epreuve='officielle', niveau='Tle', annee=2023)
        res = c.post(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/pdf/',
                     {'fichier': _pdf('corrige.pdf'), 'cible': 'corrige'}, format='multipart')
        assert res.status_code == 200, res.data
        assert res.data['corrige_pdf']
        ep.refresh_from_db()
        assert ep.corrige_pdf and not ep.fichier_pdf  # le corrigé n'écrase pas le sujet

    def test_catalogue_ne_revele_pas_le_corrige_pdf(self, setup):
        c, prof, matiere = setup
        ep = Epreuves.objects.create(id_enseignant=prof, id_matiere=matiere, titre='Annale', type_epreuve='officielle', niveau='Tle', annee=2023, statut='actif')
        c.post(f'/api/v1/enseignant/epreuves/{ep.id_epreuve}/pdf/', {'fichier': _pdf('cor.pdf'), 'cible': 'corrige'}, format='multipart')
        ce = APIClient(); register_and_auth(ce, ELEVE)
        res = ce.get('/api/v1/epreuves/')
        items = res.data.get('results', res.data)
        cible = next((e for e in items if e['id_epreuve'] == str(ep.id_epreuve)), None)
        assert cible is not None
        assert 'corrige_pdf' not in cible and 'corrige' not in cible  # anti-triche
