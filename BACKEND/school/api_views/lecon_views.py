"""Micro-leçons ciblées (Module 11).

Génère une courte leçon de remédiation à partir d'une lacune détectée
([[lacune_engine]] côté Module 9). Le contenu pédagogique vient de l'IA ;
en l'absence d'IA, un fallback méthodologique réel produit une fiche de
révision structurée (méthode de travail + renvoi vers un vrai cours publié de
la matière). La leçon est persistée pour être relue sans la régénérer.
"""
import json
import logging
import re

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from school.models import Eleves, Matieres, Lacunes, Cours, MicroLecons
from school.serializers import MicroLeconSerializer
from school import ai_service

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "Tu es un professeur camerounais (programme MINESEC / OBC) qui rédige une "
    "micro-leçon de révision claire et concise pour un lycéen. Tu réponds "
    "UNIQUEMENT par du JSON valide, sans texte autour."
)


def _construire_prompt(matiere_nom, niveau, notion, langue):
    langue_txt = "en anglais" if langue == 'en' else "en français"
    return (
        f"Matière : {matiere_nom}\nNiveau : {niveau}\nNotion à revoir : {notion}\n\n"
        f"Rédige une micro-leçon {langue_txt} sur cette notion. "
        "Réponds par un objet JSON de la forme :\n"
        '{"titre": "...", "contenu": "<explication pédagogique de 4 à 8 phrases, '
        'avec au moins un exemple concret>", '
        '"points_cles": ["...", "...", "..."]}\n'
        "« points_cles » : 3 à 5 idées essentielles à retenir, courtes."
    )


def _extraire_json(texte):
    texte = (texte or "").strip()
    if texte.startswith('```'):
        texte = re.sub(r'^```[a-zA-Z]*\n?', '', texte)
        texte = re.sub(r'\n?```$', '', texte).strip()
    debut, fin = texte.find('{'), texte.rfind('}')
    if debut != -1 and fin != -1 and fin > debut:
        texte = texte[debut:fin + 1]
    return json.loads(texte)


def _depuis_ia(matiere, niveau, notion, langue):
    """Renvoie (titre, contenu, points_cles) ou None si l'IA échoue/illisible."""
    try:
        brut = ai_service.generate(
            _construire_prompt(matiere.nom, niveau, notion, langue),
            system=SYSTEM_PROMPT, max_tokens=700, temperature=0.6,
        )
        data = _extraire_json(brut)
    except ai_service.AIUnavailable:
        return None
    except (ValueError, json.JSONDecodeError):
        logger.warning("Micro-leçon IA : JSON illisible.")
        return None

    if not isinstance(data, dict):
        return None
    titre = (data.get('titre') or '').strip()
    contenu = (data.get('contenu') or '').strip()
    if not contenu:
        return None
    points = data.get('points_cles') or []
    points = [str(p).strip() for p in points if str(p).strip()][:5] if isinstance(points, list) else []
    if not titre:
        titre = f"{matiere.nom} — {notion}"
    return titre[:200], contenu, points


def _fallback_methodologique(matiere, notion, cours_ref):
    """Fiche de révision méthodologique réelle (sans IA)."""
    titre = f"Réviser « {notion} » en {matiere.nom}"
    contenu = (
        f"Cette fiche t'aide à reprendre la notion « {notion} » en {matiere.nom}. "
        "Procède par étapes : 1) relis attentivement le cours correspondant et "
        "souligne les définitions et formules clés ; 2) réécris-les de mémoire, "
        "sans regarder, puis vérifie ; 3) refais deux ou trois exercices simples "
        "sur la notion avant de passer aux plus difficiles ; 4) explique la notion "
        "à voix haute, comme si tu l'enseignais à un camarade — c'est le meilleur "
        "test de compréhension."
    )
    if cours_ref is not None:
        contenu += (
            f" Pour approfondir, appuie-toi sur le cours « {cours_ref.titre} » "
            "disponible dans ton espace."
        )
    points = [
        "Repère définitions et formules essentielles.",
        "Restitue de mémoire puis vérifie.",
        "Entraîne-toi du plus simple au plus difficile.",
        "Explique la notion avec tes propres mots.",
    ]
    return titre[:200], contenu, points


class LeconGenererView(APIView):
    """POST /lecons/generer/ — crée une micro-leçon pour une lacune (ou matière+notion).

    Corps : `id_lacune` (recommandé) OU (`id_matiere` + `notion`).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        lacune = None
        id_lacune = request.data.get('id_lacune')
        if id_lacune:
            lacune = (
                Lacunes.objects.filter(id_lacune=id_lacune, id_eleve=eleve)
                .select_related('id_matiere').first()
            )
            if not lacune:
                return Response({"error": "Lacune introuvable."}, status=status.HTTP_404_NOT_FOUND)
            matiere = lacune.id_matiere
            notion = lacune.notion
        else:
            matiere = Matieres.objects.filter(id_matiere=request.data.get('id_matiere')).first()
            notion = (request.data.get('notion') or '').strip()
            if not matiere or not notion:
                return Response(
                    {"error": "Fournir id_lacune, ou id_matiere + notion."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        niveau = eleve.niveau_scolaire
        langue = matiere.langue if matiere.langue in ('fr', 'en') else 'fr'

        # Cours de référence réel de la même matière/niveau (pour approfondir).
        cours_ref = (
            Cours.objects.filter(id_matiere=matiere, niveau=niveau, statut='publie')
            .order_by('-date_publication').first()
        )

        resultat = _depuis_ia(matiere, niveau, notion, langue)
        if resultat:
            titre, contenu, points = resultat
            source = 'ia'
        else:
            titre, contenu, points = _fallback_methodologique(matiere, notion, cours_ref)
            source = 'fallback'

        lecon = MicroLecons.objects.create(
            id_eleve=eleve,
            id_matiere=matiere,
            id_lacune=lacune,
            id_cours=cours_ref,
            titre=titre,
            contenu=contenu,
            points_cles=points,
            source=source,
        )
        return Response(MicroLeconSerializer(lecon).data, status=status.HTTP_201_CREATED)


class LeconListView(generics.ListAPIView):
    """GET /lecons/ — micro-leçons de l'élève connecté (filtre `?lue=true|false`)."""
    serializer_class = MicroLeconSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = MicroLecons.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)
        lue = self.request.query_params.get('lue')
        if lue is not None:
            qs = qs.filter(lue=lue.lower() == 'true')
        return qs


class LeconMarquerLueView(APIView):
    """PATCH /lecons/<id>/lue/ — marque une micro-leçon comme lue."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_lecon):
        try:
            lecon = MicroLecons.objects.get(
                id_lecon=id_lecon, id_eleve__id_utilisateur=request.user.id_utilisateur)
        except MicroLecons.DoesNotExist:
            return Response({"error": "Micro-leçon introuvable."}, status=status.HTTP_404_NOT_FOUND)
        lecon.lue = True
        lecon.save(update_fields=['lue'])
        return Response(MicroLeconSerializer(lecon).data, status=status.HTTP_200_OK)
