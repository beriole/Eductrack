"""Génération d'exercices adaptatifs par l'IA (Module 2).

Crée à la volée une épreuve de type « exercice » avec N questions QCM ciblant
une matière (et éventuellement une notion/lacune précise) pour le niveau de
l'élève. Si l'IA est indisponible ou répond mal, on retombe sur la banque de
questions existante (questions d'autres épreuves de la même matière/niveau).

L'exercice généré s'intègre au flux normal : on retourne une épreuve que
l'élève peut démarrer via /epreuves/<id>/demarrer/, comme n'importe quelle
autre épreuve.
"""
import json
import logging
import random
import re

from django.db import transaction
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from school.models import Eleves, Matieres, Lacunes, Epreuves, Questions
from school.serializers import EpreuveSerializer
from school import ai_service

logger = logging.getLogger(__name__)

DIFFICULTES = ('facile', 'moyen', 'difficile')
NB_MIN, NB_MAX, NB_DEFAUT = 3, 10, 5

SYSTEM_PROMPT = (
    "Tu es un concepteur d'exercices pour des lycéens camerounais (programme "
    "MINESEC / OBC). Tu produis des QCM clairs, corrects et adaptés au niveau "
    "demandé. Tu réponds UNIQUEMENT par du JSON valide, sans aucun texte autour."
)


def _construire_prompt(matiere_nom, niveau, serie, chapitre, notion, difficulte, nb, langue):
    """Construit le prompt de génération en exigeant un JSON strict."""
    contexte = f"Matière : {matiere_nom}\nNiveau : {niveau}"
    if serie:
        contexte += f"\nSérie : {serie}"
    cible = " / ".join(x for x in (chapitre, notion) if x)
    if cible:
        contexte += f"\nNotion ciblée : {cible}"
    langue_txt = "en anglais" if langue == 'en' else "en français"
    return (
        f"{contexte}\n\n"
        f"Génère exactement {nb} questions QCM de difficulté « {difficulte} » {langue_txt}.\n"
        "Chaque question a 4 options et UNE seule bonne réponse.\n"
        "Réponds par un TABLEAU JSON où chaque élément a exactement la forme :\n"
        '{"enonce": "...", "options": ["...", "...", "...", "..."], '
        '"reponse_correcte": "<texte exact de la bonne option>", '
        '"explication": "...", "difficulte": "facile|moyen|difficile"}\n'
        "IMPORTANT : « reponse_correcte » doit être STRICTEMENT identique "
        "à l'une des chaînes du tableau « options »."
    )


def _extraire_json(texte):
    """Récupère le tableau JSON même s'il est entouré de ``` ou de texte parasite."""
    texte = (texte or "").strip()
    if texte.startswith('```'):
        texte = re.sub(r'^```[a-zA-Z]*\n?', '', texte)
        texte = re.sub(r'\n?```$', '', texte).strip()
    # Isoler le premier tableau [ ... ] si du texte traîne autour.
    debut = texte.find('[')
    fin = texte.rfind(']')
    if debut != -1 and fin != -1 and fin > debut:
        texte = texte[debut:fin + 1]
    return json.loads(texte)


def _valider_questions(data, nb):
    """Filtre et normalise les questions renvoyées par l'IA.

    Ne garde que celles dont la réponse correcte figure bien dans les options
    (sinon la correction automatique serait impossible)."""
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
        if len(options) < 2:
            continue
        correcte = (item.get('reponse_correcte') or '').strip()
        if correcte not in options:
            continue
        diff = item.get('difficulte')
        if diff not in DIFFICULTES:
            diff = 'moyen'
        propres.append({
            'enonce': enonce,
            'options': options,
            'reponse_correcte': correcte,
            'explication': (item.get('explication') or '').strip() or None,
            'difficulte': diff,
            'type_question': 'qcm',
        })
        if len(propres) >= nb:
            break
    return propres


class ExerciceGenererView(APIView):
    """POST /exercices/generer/ — génère une épreuve d'exercice adaptée à l'élève.

    Corps attendu (JSON) :
      - id_matiere (uuid) OU id_lacune (uuid) : la cible. id_lacune est
        prioritaire et permet de cibler une notion précise.
      - difficulte : facile | moyen | difficile (défaut : moyen)
      - nb_questions : 3 à 10 (défaut : 5)

    Réponse 201 : l'épreuve sérialisée + `source_generation` (ia | banque).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # ── Paramètres ────────────────────────────────────────────────────────
        difficulte = (request.data.get('difficulte') or 'moyen').strip()
        if difficulte not in DIFFICULTES:
            difficulte = 'moyen'
        try:
            nb = int(request.data.get('nb_questions', NB_DEFAUT))
        except (TypeError, ValueError):
            nb = NB_DEFAUT
        nb = max(NB_MIN, min(NB_MAX, nb))

        # ── Cible : lacune prioritaire, sinon matière ─────────────────────────
        chapitre = notion = None
        id_lacune = request.data.get('id_lacune')
        if id_lacune:
            lacune = (
                Lacunes.objects.filter(id_lacune=id_lacune, id_eleve=eleve)
                .select_related('id_matiere')
                .first()
            )
            if not lacune:
                return Response({"error": "Lacune introuvable."}, status=status.HTTP_404_NOT_FOUND)
            matiere = lacune.id_matiere
            chapitre, notion = lacune.chapitre, lacune.notion
        else:
            id_matiere = request.data.get('id_matiere')
            if not id_matiere:
                return Response(
                    {"error": "Fournir id_matiere ou id_lacune."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            matiere = Matieres.objects.filter(id_matiere=id_matiere).first()
            if not matiere:
                return Response({"error": "Matière introuvable."}, status=status.HTTP_404_NOT_FOUND)

        niveau = eleve.niveau_scolaire
        serie = eleve.serie
        langue = matiere.langue if matiere.langue in ('fr', 'en') else 'fr'

        # ── 1) Tentative IA ───────────────────────────────────────────────────
        source = 'ia'
        questions = []
        prompt = _construire_prompt(matiere.nom, niveau, serie, chapitre, notion, difficulte, nb, langue)
        try:
            texte = ai_service.chat(
                [{"role": "user", "content": prompt}],
                system=SYSTEM_PROMPT,
                max_tokens=1500,
                temperature=0.7,
            )
            questions = _valider_questions(_extraire_json(texte), nb)
        except ai_service.AIUnavailable:
            questions = []
        except (ValueError, json.JSONDecodeError):
            logger.warning("Exercice IA : réponse JSON illisible.")
            questions = []

        # ── 2) Fallback : banque de questions existante ───────────────────────
        if not questions:
            source = 'banque'
            questions = self._fallback_banque(matiere, niveau, difficulte, nb)

        if not questions:
            return Response(
                {"error": "Génération impossible pour le moment (IA indisponible et banque vide)."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # ── 3) Création de l'épreuve + questions ──────────────────────────────
        epreuve = self._creer_epreuve(matiere, niveau, serie, langue, chapitre, notion, questions)

        data = EpreuveSerializer(epreuve).data
        data['source_generation'] = source
        return Response(data, status=status.HTTP_201_CREATED)

    def _fallback_banque(self, matiere, niveau, difficulte, nb):
        """Pioche des questions auto-corrigeables dans les épreuves existantes."""
        qs = (
            Questions.objects.filter(
                id_epreuve__id_matiere=matiere,
                id_epreuve__niveau=niveau,
                id_epreuve__statut='actif',
                type_question__in=('qcm', 'vrai_faux'),
            )
            .exclude(reponse_correcte__isnull=True)
            .exclude(reponse_correcte='')
        )
        # Priorité à la difficulté demandée, sinon on élargit.
        pool = list(qs.filter(difficulte=difficulte)) or list(qs)
        if not pool:
            return []
        random.shuffle(pool)
        return [
            {
                'enonce': q.enonce,
                'options': q.options if isinstance(q.options, list) else [],
                'reponse_correcte': q.reponse_correcte,
                'explication': q.explication or None,
                'difficulte': q.difficulte,
                'type_question': q.type_question,
            }
            for q in pool[:nb]
        ]

    @transaction.atomic
    def _creer_epreuve(self, matiere, niveau, serie, langue, chapitre, notion, questions):
        cible = notion or chapitre
        titre = f"Exercice IA — {matiere.nom}"
        if cible:
            titre += f" : {cible}"
        epreuve = Epreuves.objects.create(
            id_matiere=matiere,
            titre=titre[:200],
            type_epreuve='exercice',
            niveau=niveau,
            serie=serie or None,
            source='custom',
            duree_minutes=max(5, len(questions) * 3),
            langue=langue,
            nb_questions=len(questions),
            statut='actif',
        )
        Questions.objects.bulk_create([
            Questions(
                id_epreuve=epreuve,
                numero_ordre=i,
                enonce=q['enonce'],
                type_question=q.get('type_question', 'qcm'),
                options=q['options'],
                reponse_correcte=q['reponse_correcte'],
                points=1.0,
                explication=q['explication'],
                difficulte=q['difficulte'],
            )
            for i, q in enumerate(questions, start=1)
        ])
        return epreuve
