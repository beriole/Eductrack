"""Tests Module 1.2 — Import/analyse d'annales PDF → extraction de questions."""
import io
import json
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from school.models import Enseignants, Matieres, Epreuves, Questions
from school.api_views import import_views


def register_and_auth(client, data):
    res = client.post('/api/v1/auth/register/', data, format='json')
    assert res.status_code == 201, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['tokens']['access']}")
    return res.data


ENSEIGNANT = {
    'email': 'imp_prof@test.cm', 'password': 'TestPass123!',
    'nom': 'Ondoa', 'prenom': 'Paul', 'telephone': '+237699700010',
    'role': 'enseignant',
}
ELEVE = {
    'email': 'imp_eleve@test.cm', 'password': 'TestPass123!',
    'nom': 'X', 'prenom': 'Y', 'telephone': '+237699700011',
    'role': 'eleve', 'niveau_scolaire': 'Tle', 'region': 'Centre',
}


def _make_pdf(lines):
    """Construit un vrai PDF (couche texte) à partir de lignes."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    text = c.beginText(40, 800)
    for line in lines:
        text.textLine(line)
    c.drawText(text)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


def _pdf_upload(lines, name='annale.pdf'):
    return SimpleUploadedFile(name, _make_pdf(lines), content_type='application/pdf')


def _matiere():
    return Matieres.objects.create(code='HIS', nom='Histoire', niveaux=['Tle'])


FAUSSE_REPONSE_IA = json.dumps([
    {"enonce": "Quelle est la capitale du Cameroun ?", "type_question": "qcm",
     "options": ["Douala", "Yaoundé", "Bafoussam"], "reponse_correcte": "Yaoundé", "points": 2},
    {"enonce": "Citez deux causes de la Première Guerre mondiale.",
     "type_question": "reponse_courte", "options": [], "reponse_correcte": "", "points": 3},
])


@pytest.mark.django_db
class TestImportPDF:

    def test_authentification_requise(self):
        c = APIClient()
        res = c.post('/api/v1/epreuves/importer-pdf/', {}, format='multipart')
        assert res.status_code == 401

    def test_eleve_interdit(self):
        c = APIClient()
        register_and_auth(c, ELEVE)
        res = c.post('/api/v1/epreuves/importer-pdf/', {}, format='multipart')
        assert res.status_code == 403

    def test_fichier_manquant(self):
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        res = c.post('/api/v1/epreuves/importer-pdf/', {}, format='multipart')
        assert res.status_code == 400

    def test_refus_non_pdf(self):
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        fichier = SimpleUploadedFile('notes.txt', b'pas un pdf', content_type='text/plain')
        res = c.post('/api/v1/epreuves/importer-pdf/', {'fichier': fichier}, format='multipart')
        assert res.status_code == 400

    def test_metadonnees_manquantes(self):
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        res = c.post('/api/v1/epreuves/importer-pdf/',
                     {'fichier': _pdf_upload(['1. Question ?'])}, format='multipart')
        assert res.status_code == 400  # titre, id_matiere, niveau manquants

    def test_extraction_ia(self, monkeypatch):
        monkeypatch.setattr(import_views.ai_service, 'chat',
                            lambda *a, **k: FAUSSE_REPONSE_IA)
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        matiere = _matiere()
        res = c.post('/api/v1/epreuves/importer-pdf/', {
            'fichier': _pdf_upload(['Texte brut de l annale...']),
            'titre': 'BAC Histoire 2023', 'id_matiere': str(matiere.id_matiere),
            'niveau': 'Tle', 'annee': '2023', 'source': 'MINESEC',
        }, format='multipart')
        assert res.status_code == 201, res.data
        assert res.data['source_extraction'] == 'ia'
        assert res.data['nb_questions_extraites'] == 2
        epreuve = Epreuves.objects.get(id_epreuve=res.data['id_epreuve'])
        qs = Questions.objects.filter(id_epreuve=epreuve).order_by('numero_ordre')
        assert qs.count() == 2
        assert qs[0].type_question == 'qcm'
        assert qs[0].reponse_correcte == 'Yaoundé'
        assert qs[1].type_question == 'reponse_courte'
        # L'épreuve est rattachée à l'enseignant importateur.
        assert epreuve.id_enseignant is not None
        assert epreuve.annee == 2023

    def test_fallback_regles_sur_pdf_reel(self, monkeypatch):
        # IA indisponible → parsing par règles du vrai texte PDF.
        def ko(*a, **k):
            raise import_views.ai_service.AIUnavailable("pas de clé")
        monkeypatch.setattr(import_views.ai_service, 'chat', ko)

        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        matiere = _matiere()
        lignes = [
            "EPREUVE D'HISTOIRE - Terminale",
            "1. Quelle est la capitale politique du Cameroun ?",
            "a) Douala",
            "b) Yaounde",
            "c) Garoua",
            "2. Definissez le mot colonisation.",
            "3. Citez trois pays d'Afrique centrale.",
        ]
        res = c.post('/api/v1/epreuves/importer-pdf/', {
            'fichier': _pdf_upload(lignes),
            'titre': 'Annale Histoire', 'id_matiere': str(matiere.id_matiere), 'niveau': 'Tle',
        }, format='multipart')
        assert res.status_code == 201, res.data
        assert res.data['source_extraction'] == 'regles'
        qs = Questions.objects.filter(id_epreuve=res.data['id_epreuve']).order_by('numero_ordre')
        assert qs.count() == 3
        # Q1 a 3 options → QCM ; Q2/Q3 sans options → réponse courte.
        assert qs[0].type_question == 'qcm'
        assert len(qs[0].options) == 3
        assert qs[1].type_question == 'reponse_courte'

    def test_pdf_sans_texte_renvoie_422(self, monkeypatch):
        def ko(*a, **k):
            raise import_views.ai_service.AIUnavailable("x")
        monkeypatch.setattr(import_views.ai_service, 'chat', ko)
        c = APIClient()
        register_and_auth(c, ENSEIGNANT)
        matiere = _matiere()
        res = c.post('/api/v1/epreuves/importer-pdf/', {
            'fichier': _pdf_upload([]),  # PDF vide, aucune couche texte
            'titre': 'Vide', 'id_matiere': str(matiere.id_matiere), 'niveau': 'Tle',
        }, format='multipart')
        assert res.status_code == 422
