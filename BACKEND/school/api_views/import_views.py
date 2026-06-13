"""Import et analyse d'annales PDF → extraction de questions (Module 1.2).

Un enseignant téléverse une épreuve au format PDF. Le texte est extrait avec
pypdf, puis structuré en questions : d'abord par l'IA (Groq, sortie JSON), avec
un **fallback par règles** (analyse des numérotations 1./2)/a) etc.) si l'IA est
indisponible ou si le PDF ne contient pas de couche texte exploitable. Les
questions sont enregistrées dans une nouvelle épreuve, prête à être passée.
"""
import json
import logging
import re

from django.db import transaction
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

from school.models import Enseignants, Matieres, Epreuves, Questions
from school.serializers import EpreuveSerializer
from school import ai_service

logger = logging.getLogger(__name__)

TYPES_EPREUVE = {'officielle', 'simulation', 'exercice'}
TYPES_QUESTION = {'qcm', 'vrai_faux', 'reponse_courte', 'redaction'}
MAX_QUESTIONS = 60
MAX_CHARS_IA = 8000  # borne d'entrée IA pour maîtriser les tokens

SYSTEM_PROMPT = (
    "Tu es un assistant qui structure des épreuves d'examen camerounaises "
    "(MINESEC / OBC / GCE). On te donne le texte brut d'une annale et tu en "
    "extrais les questions. Tu réponds UNIQUEMENT par du JSON valide."
)


def extraire_texte_pdf(fichier) -> str:
    """Extrait le texte d'un fichier PDF téléversé. Lève ValueError si illisible."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(fichier)
        morceaux = []
        for page in reader.pages:
            txt = page.extract_text() or ""
            if txt.strip():
                morceaux.append(txt)
        return "\n".join(morceaux).strip()
    except Exception as exc:  # PDF chiffré, corrompu, non-PDF…
        raise ValueError("PDF illisible.") from exc


def _construire_prompt(texte, langue):
    langue_txt = "en anglais" if langue == 'en' else "en français"
    return (
        f"Voici le texte brut d'une annale {langue_txt} :\n\n"
        f"\"\"\"\n{texte[:MAX_CHARS_IA]}\n\"\"\"\n\n"
        "Extrais-en les questions sous forme d'un TABLEAU JSON. Chaque élément :\n"
        '{"enonce": "...", "type_question": "qcm|vrai_faux|reponse_courte|redaction", '
        '"options": ["..."], "reponse_correcte": "", "points": 1}\n'
        "- « options » : non vide UNIQUEMENT pour les QCM (sinon []).\n"
        "- « reponse_correcte » : la bonne option si elle est clairement indiquée "
        "dans le texte, sinon chaîne vide.\n"
        "- Ignore les consignes générales, en-têtes et barèmes : ne garde que les questions."
    )


def _normaliser(data):
    """Valide/normalise une liste de questions issues de l'IA."""
    propres = []
    if not isinstance(data, list):
        return propres
    for item in data:
        if not isinstance(item, dict):
            continue
        enonce = (item.get('enonce') or '').strip()
        if not enonce:
            continue
        type_q = item.get('type_question')
        options = item.get('options') or []
        if not isinstance(options, list):
            options = []
        options = [str(o).strip() for o in options if str(o).strip()]
        if type_q not in TYPES_QUESTION:
            type_q = 'qcm' if len(options) >= 2 else 'reponse_courte'
        correcte = (item.get('reponse_correcte') or '').strip()
        if correcte and options and correcte not in options:
            correcte = ''  # incohérent → laissé à la correction manuelle
        try:
            points = float(item.get('points', 1) or 1)
        except (TypeError, ValueError):
            points = 1.0
        propres.append({
            'enonce': enonce,
            'type_question': type_q,
            'options': options if type_q == 'qcm' else [],
            'reponse_correcte': correcte or None,
            'points': max(0.5, min(20.0, points)),
        })
        if len(propres) >= MAX_QUESTIONS:
            break
    return propres


def _extraire_json(texte):
    texte = (texte or "").strip()
    if texte.startswith('```'):
        texte = re.sub(r'^```[a-zA-Z]*\n?', '', texte)
        texte = re.sub(r'\n?```$', '', texte).strip()
    debut, fin = texte.find('['), texte.rfind(']')
    if debut != -1 and fin != -1 and fin > debut:
        texte = texte[debut:fin + 1]
    return json.loads(texte)


# Numérotation de question : « 1. », « 1) », « Question 1 », « Exercice 2 ».
_RE_QUESTION = re.compile(
    r'^\s*(?:(?:question|exercice|exo)\s*)?(\d{1,2})\s*[\.\)\-:]\s+(.+)$',
    re.IGNORECASE,
)
# Option de QCM : « a) », « A. », « - », « • ».
_RE_OPTION = re.compile(r'^\s*(?:[a-eA-E]\s*[\.\)]|[-•])\s+(.+)$')


def parser_par_regles(texte):
    """Extraction sans IA : détecte questions numérotées et options à puces."""
    questions = []
    courant = None
    for ligne in texte.splitlines():
        ligne = ligne.rstrip()
        if not ligne.strip():
            continue
        m_q = _RE_QUESTION.match(ligne)
        if m_q:
            if courant:
                questions.append(courant)
            courant = {'enonce': m_q.group(2).strip(), 'options': []}
            continue
        m_o = _RE_OPTION.match(ligne)
        if m_o and courant is not None:
            courant['options'].append(m_o.group(1).strip())
        elif courant is not None and not courant['options']:
            # Ligne de continuation de l'énoncé (avant toute option).
            courant['enonce'] += ' ' + ligne.strip()
    if courant:
        questions.append(courant)

    propres = []
    for q in questions:
        enonce = q['enonce'].strip()
        if len(enonce) < 5:
            continue
        options = [o for o in q['options'] if o]
        type_q = 'qcm' if len(options) >= 2 else 'reponse_courte'
        propres.append({
            'enonce': enonce,
            'type_question': type_q,
            'options': options if type_q == 'qcm' else [],
            'reponse_correcte': None,
            'points': 1.0,
        })
        if len(propres) >= MAX_QUESTIONS:
            break
    return propres


class EpreuveImportPDFView(APIView):
    """POST /epreuves/importer-pdf/ — importe une annale PDF (enseignant).

    multipart/form-data : `fichier` (PDF) + `titre`, `id_matiere`, `niveau`,
    et optionnellement `serie`, `annee`, `source`, `type_epreuve`, `langue`.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if request.user.role != 'enseignant':
            return Response({"error": "Réservé aux enseignants."}, status=status.HTTP_403_FORBIDDEN)
        enseignant = Enseignants.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not enseignant:
            return Response({"error": "Profil enseignant introuvable."}, status=status.HTTP_404_NOT_FOUND)

        fichier = request.FILES.get('fichier')
        if not fichier:
            return Response({"error": "Aucun fichier fourni (champ 'fichier')."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not fichier.name.lower().endswith('.pdf'):
            return Response({"error": "Le fichier doit être un PDF."},
                            status=status.HTTP_400_BAD_REQUEST)

        titre = (request.data.get('titre') or '').strip()
        matiere = Matieres.objects.filter(id_matiere=request.data.get('id_matiere')).first()
        niveau = (request.data.get('niveau') or '').strip()
        if not titre or not matiere or not niveau:
            return Response({"error": "titre, id_matiere et niveau sont requis."},
                            status=status.HTTP_400_BAD_REQUEST)

        type_epreuve = request.data.get('type_epreuve') or 'officielle'
        if type_epreuve not in TYPES_EPREUVE:
            type_epreuve = 'officielle'
        langue = request.data.get('langue') if request.data.get('langue') in ('fr', 'en') else matiere.langue
        if langue not in ('fr', 'en'):
            langue = 'fr'

        # 1) Extraction du texte
        try:
            texte = extraire_texte_pdf(fichier)
        except ValueError:
            return Response({"error": "Impossible de lire ce PDF."},
                            status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        if not texte:
            return Response(
                {"error": "Aucun texte exploitable (PDF scanné/image ?). Un PDF avec texte est requis."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        # 2) Structuration : IA puis fallback règles
        source = 'ia'
        questions = []
        try:
            brut = ai_service.chat(
                [{"role": "user", "content": _construire_prompt(texte, langue)}],
                system=SYSTEM_PROMPT, max_tokens=2500, temperature=0.2,
            )
            questions = _normaliser(_extraire_json(brut))
        except ai_service.AIUnavailable:
            questions = []
        except (ValueError, json.JSONDecodeError):
            logger.warning("Import PDF : JSON IA illisible.")
            questions = []

        if not questions:
            source = 'regles'
            questions = parser_par_regles(texte)

        if not questions:
            return Response(
                {"error": "Aucune question n'a pu être extraite de ce PDF."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        # 3) Création de l'épreuve + questions
        epreuve = self._creer_epreuve(
            request.data, enseignant, matiere, titre, type_epreuve, niveau, langue, questions)

        data = EpreuveSerializer(epreuve).data
        data['source_extraction'] = source
        data['nb_questions_extraites'] = len(questions)
        return Response(data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def _creer_epreuve(self, payload, enseignant, matiere, titre, type_epreuve, niveau, langue, questions):
        serie = (payload.get('serie') or '').strip() or None
        annee = payload.get('annee')
        try:
            annee = int(annee) if annee else None
        except (TypeError, ValueError):
            annee = None
        source_doc = (payload.get('source') or '').strip() or None

        epreuve = Epreuves.objects.create(
            id_matiere=matiere,
            id_enseignant=enseignant,
            titre=titre[:200],
            type_epreuve=type_epreuve,
            niveau=niveau,
            serie=serie,
            annee=annee,
            source=source_doc,
            langue=langue,
            nb_questions=len(questions),
            statut='actif',
        )
        Questions.objects.bulk_create([
            Questions(
                id_epreuve=epreuve,
                numero_ordre=i,
                enonce=q['enonce'],
                type_question=q['type_question'],
                options=q['options'],
                reponse_correcte=q['reponse_correcte'],
                points=q['points'],
                difficulte='moyen',
            )
            for i, q in enumerate(questions, start=1)
        ])
        return epreuve
