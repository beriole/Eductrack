"""Micro-révisions quotidiennes (style Duolingo).

Chaque jour, un court lot de questions est **généré par l'IA** en ciblant les
lacunes de l'élève, puis assemblé dans une épreuve dédiée jouable via le flux
normal. Une tâche Celery pousse un rappel quotidien par notification. Si l'IA
est indisponible, on retombe sur la banque de questions existantes.
"""
import datetime
import json
import logging
import random
import re

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from school.models import Eleves, Questions, Epreuves, Lacunes, Matieres, MicroRevisions
from school import ai_service

logger = logging.getLogger(__name__)

NB_QUESTIONS = 5
DIFFICULTES = ('facile', 'moyen', 'difficile')

SYSTEM_PROMPT = (
    "Tu es un concepteur d'exercices pour lycéens camerounais (MINESEC / OBC). "
    "Tu crées de courtes révisions quotidiennes variées et motivantes. "
    "Tu réponds UNIQUEMENT par du JSON valide, sans texte autour."
)


# ─── Sélection / génération des questions ────────────────────────────────────

def _notions_faibles(eleve):
    """Renvoie jusqu'à 3 (matiere, notion) où l'élève a des lacunes."""
    lacunes = (
        Lacunes.objects.filter(id_eleve=eleve, statut__in=('detectee', 'en_cours'))
        .select_related('id_matiere').order_by('taux_maitrise')[:3]
    )
    return [(l.id_matiere, l.notion) for l in lacunes]


def _matiere_par_defaut(eleve):
    """Une matière pertinente pour rattacher l'épreuve du jour."""
    q = (
        Questions.objects.filter(id_epreuve__niveau=eleve.niveau_scolaire)
        .select_related('id_epreuve__id_matiere').first()
    )
    if q:
        return q.id_epreuve.id_matiere
    return Matieres.objects.first()


def _extraire_json(texte):
    texte = (texte or "").strip()
    if texte.startswith('```'):
        texte = re.sub(r'^```[a-zA-Z]*\n?', '', texte)
        texte = re.sub(r'\n?```$', '', texte).strip()
    debut, fin = texte.find('['), texte.rfind(']')
    if debut != -1 and fin != -1 and fin > debut:
        texte = texte[debut:fin + 1]
    return json.loads(texte)


def _valider(data):
    """Ne garde que les QCM dont la bonne réponse figure dans les options."""
    propres = []
    if not isinstance(data, list):
        return propres
    for item in data:
        if not isinstance(item, dict):
            continue
        enonce = (item.get('enonce') or '').strip()
        options = item.get('options') or []
        if not enonce or not isinstance(options, list):
            continue
        options = [str(o).strip() for o in options if str(o).strip()]
        correcte = (item.get('reponse_correcte') or '').strip()
        if len(options) < 2 or correcte not in options:
            continue
        diff = item.get('difficulte') if item.get('difficulte') in DIFFICULTES else 'moyen'
        propres.append({
            'enonce': enonce, 'options': options, 'reponse_correcte': correcte,
            'explication': (item.get('explication') or '').strip() or None,
            'difficulte': diff, 'type_question': 'qcm',
        })
        if len(propres) >= NB_QUESTIONS:
            break
    return propres


def _questions_ia(eleve):
    """Génère NB_QUESTIONS questions ciblées via l'IA. [] si indisponible/illisible."""
    notions = _notions_faibles(eleve)
    if notions:
        cibles = "; ".join(f"{m.nom} — {n}" for m, n in notions)
        focus = f"Concentre-toi sur ces notions à renforcer : {cibles}."
    else:
        focus = "Couvre les matières principales du programme de ce niveau."

    prompt = (
        f"Niveau : {eleve.niveau_scolaire}"
        + (f" (série {eleve.serie})" if eleve.serie else "") + "\n"
        f"{focus}\n\n"
        f"Génère {NB_QUESTIONS} questions QCM courtes et variées pour une "
        "révision quotidienne. Chaque question a 4 options et UNE bonne réponse.\n"
        "Réponds par un TABLEAU JSON, chaque élément :\n"
        '{"enonce": "...", "options": ["...","...","...","..."], '
        '"reponse_correcte": "<texte exact d\'une option>", '
        '"explication": "...", "difficulte": "facile|moyen|difficile"}'
    )
    try:
        brut = ai_service.chat(
            [{"role": "user", "content": prompt}], system=SYSTEM_PROMPT,
            max_tokens=1500, temperature=0.8)
        return _valider(_extraire_json(brut))
    except ai_service.AIUnavailable:
        return []
    except (ValueError, json.JSONDecodeError):
        logger.warning("Révision IA : JSON illisible.")
        return []


def _questions_banque(eleve):
    """Fallback : pioche des QCM auto-corrigeables du niveau, priorité lacunes."""
    base = (
        Questions.objects.filter(
            id_epreuve__niveau=eleve.niveau_scolaire,
            id_epreuve__statut='actif',
            type_question__in=('qcm', 'vrai_faux'),
        ).exclude(reponse_correcte__isnull=True).exclude(reponse_correcte='')
    )
    faibles = list(
        Lacunes.objects.filter(id_eleve=eleve, statut__in=('detectee', 'en_cours'))
        .values_list('id_matiere', flat=True)
    )
    choisies = []
    if faibles:
        pri = list(base.filter(id_epreuve__id_matiere__in=faibles))
        random.shuffle(pri)
        choisies = pri[:NB_QUESTIONS]
    if len(choisies) < NB_QUESTIONS:
        ids = {q.id_question for q in choisies}
        autres = list(base.exclude(id_question__in=ids))
        random.shuffle(autres)
        choisies += autres[: NB_QUESTIONS - len(choisies)]
    return [
        {
            'enonce': q.enonce,
            'options': q.options if isinstance(q.options, list) else [],
            'reponse_correcte': q.reponse_correcte,
            'explication': q.explication,
            'difficulte': q.difficulte,
            'type_question': q.type_question,
        }
        for q in choisies
    ]


@transaction.atomic
def _construire_epreuve(eleve, jour, matiere, questions):
    epreuve = Epreuves.objects.create(
        id_matiere=matiere,
        titre=f"Révision du jour — {jour.strftime('%d/%m/%Y')}",
        type_epreuve='exercice',
        niveau=eleve.niveau_scolaire,
        serie=eleve.serie or None,
        source='custom',
        duree_minutes=max(3, len(questions) * 2),
        langue='fr',
        nb_questions=len(questions),
        statut='actif',
    )
    Questions.objects.bulk_create([
        Questions(
            id_epreuve=epreuve, numero_ordre=i, enonce=q['enonce'],
            type_question=q.get('type_question', 'qcm'),
            options=q['options'] if q.get('type_question', 'qcm') in ('qcm', 'vrai_faux') else [],
            reponse_correcte=q['reponse_correcte'], points=1.0,
            explication=q.get('explication'), difficulte=q.get('difficulte', 'moyen'),
        )
        for i, q in enumerate(questions, start=1)
    ])
    return epreuve


def generer_revision_du_jour(eleve, jour=None):
    """Récupère ou prépare la révision du jour de l'élève (IA puis fallback banque).

    Réutilisé par l'endpoint et la tâche Celery. Renvoie l'objet MicroRevisions
    (avec `id_epreuve` si des questions ont pu être réunies, sinon None)."""
    jour = jour or timezone.localdate()
    revision, _cree = MicroRevisions.objects.get_or_create(id_eleve=eleve, date_jour=jour)
    if revision.id_epreuve is not None or revision.completee:
        return revision

    questions = _questions_ia(eleve)
    source = 'ia'
    if not questions:
        questions = _questions_banque(eleve)
        source = 'banque'
    if not questions:
        return revision  # rien à proposer aujourd'hui (id_epreuve reste None)

    matiere = _notions_faibles(eleve)
    matiere = matiere[0][0] if matiere else _matiere_par_defaut(eleve)
    if matiere is None:
        return revision

    revision.id_epreuve = _construire_epreuve(eleve, jour, matiere, questions)
    revision.source = source
    revision.save(update_fields=['id_epreuve', 'source'])
    return revision


def serie_revisions(eleve, aujourdhui):
    """Jours consécutifs de révisions complétées (vivante tant qu'hier est validé)."""
    jours = set(
        MicroRevisions.objects.filter(id_eleve=eleve, completee=True)
        .values_list('date_jour', flat=True)
    )
    if not jours:
        return 0
    depart = aujourdhui if aujourdhui in jours else aujourdhui - datetime.timedelta(days=1)
    if depart not in jours:
        return 0
    serie, jour = 0, depart
    while jour in jours:
        serie += 1
        jour -= datetime.timedelta(days=1)
    return serie


# Alias rétro-compatible pour les tests existants.
_serie_revisions = serie_revisions


# ─── Endpoints ───────────────────────────────────────────────────────────────

class RevisionDuJourView(APIView):
    """GET /revisions/du-jour/ — récupère (ou prépare) la révision quotidienne."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        jour = timezone.localdate()
        revision = generer_revision_du_jour(eleve, jour)

        if revision.id_epreuve is None and not revision.completee:
            return Response({
                "disponible": False,
                "message": "Aucune question disponible pour ta classe pour le moment.",
                "serie_revisions": serie_revisions(eleve, jour),
            }, status=status.HTTP_200_OK)

        epreuve = revision.id_epreuve
        return Response({
            "disponible": True,
            "id_revision": str(revision.id_revision),
            "id_epreuve": str(epreuve.id_epreuve) if epreuve else None,
            "duree_minutes": epreuve.duree_minutes if epreuve else 0,
            "nb_questions": epreuve.nb_questions if epreuve else 0,
            "source": revision.source,
            "completee": revision.completee,
            "note": float(revision.note) if revision.note is not None else None,
            "serie_revisions": serie_revisions(eleve, jour),
        }, status=status.HTTP_200_OK)


class RevisionCompleterView(APIView):
    """POST /revisions/du-jour/completer/ — marque la révision du jour terminée.

    Corps optionnel : `note` (/20). Idempotent."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        jour = timezone.localdate()
        revision = MicroRevisions.objects.filter(id_eleve=eleve, date_jour=jour).first()
        if not revision:
            return Response({"error": "Aucune révision du jour. Récupère-la d'abord."},
                            status=status.HTTP_404_NOT_FOUND)

        if not revision.completee:
            note = request.data.get('note')
            try:
                revision.note = max(0, min(20, float(note))) if note is not None else None
            except (TypeError, ValueError):
                revision.note = None
            revision.completee = True
            revision.date_completion = timezone.now()
            revision.save(update_fields=['completee', 'note', 'date_completion'])

        return Response({
            "completee": True,
            "note": float(revision.note) if revision.note is not None else None,
            "serie_revisions": serie_revisions(eleve, jour),
        }, status=status.HTTP_200_OK)
