"""Atelier rédaction (EF-15).

Analyse une production écrite et renvoie un score d'expression avec des
suggestions. Le moteur fonctionne par règles (longueur, structure, richesse
lexicale, ponctuation) afin de rester opérationnel sans clé d'IA externe.
Si une clé Anthropic est configurée, une appréciation qualitative est ajoutée.
"""
import re

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.conf import settings

TYPE_CHOICES = {
    'dissertation': {'min_mots': 300, 'label': 'Dissertation'},
    'resume': {'min_mots': 100, 'label': 'Résumé'},
    'commentaire': {'min_mots': 250, 'label': 'Commentaire de texte'},
    'redaction': {'min_mots': 150, 'label': 'Rédaction'},
}

# Connecteurs logiques valorisés dans une argumentation structurée.
CONNECTEURS = [
    "d'abord", 'ensuite', 'enfin', 'cependant', 'néanmoins', 'toutefois',
    'par ailleurs', 'en effet', 'ainsi', 'donc', 'car', 'puisque',
    'en conclusion', 'premièrement', 'deuxièmement', 'en outre', 'de plus',
    'par conséquent', 'or', 'pourtant',
]


def analyser_texte(texte: str, type_exercice: str) -> dict:
    """Calcule un score sur 100 et des retours structurés sur la production."""
    texte = texte.strip()
    mots = re.findall(r"\b[\wàâäéèêëïîôöùûüç'-]+\b", texte, flags=re.IGNORECASE)
    nb_mots = len(mots)
    phrases = [p for p in re.split(r'[.!?]+', texte) if p.strip()]
    nb_phrases = len(phrases)
    paragraphes = [p for p in texte.split('\n') if p.strip()]
    nb_paragraphes = len(paragraphes)

    config = TYPE_CHOICES.get(type_exercice, TYPE_CHOICES['redaction'])
    min_mots = config['min_mots']

    suggestions = []
    points_forts = []

    # 1. Longueur (30 pts)
    if nb_mots >= min_mots:
        score_longueur = 30
        points_forts.append(f"Longueur suffisante ({nb_mots} mots).")
    else:
        score_longueur = round(30 * nb_mots / min_mots)
        suggestions.append(
            f"Développe davantage : {nb_mots}/{min_mots} mots attendus pour une {config['label'].lower()}."
        )

    # 2. Structure en paragraphes (20 pts)
    if nb_paragraphes >= 3:
        score_structure = 20
        points_forts.append("Bonne structure (introduction, développement, conclusion).")
    elif nb_paragraphes == 2:
        score_structure = 12
        suggestions.append("Ajoute un paragraphe : vise introduction / développement / conclusion.")
    else:
        score_structure = 5
        suggestions.append("Structure ton texte en plusieurs paragraphes distincts.")

    # 3. Longueur moyenne des phrases (20 pts) — lisibilité
    moy_mots_phrase = (nb_mots / nb_phrases) if nb_phrases else 0
    if 8 <= moy_mots_phrase <= 25:
        score_phrases = 20
        points_forts.append("Phrases de longueur équilibrée.")
    elif moy_mots_phrase > 25:
        score_phrases = 10
        suggestions.append("Tes phrases sont longues : découpe-les pour gagner en clarté.")
    else:
        score_phrases = 10
        suggestions.append("Tes phrases sont très courtes : enrichis-les pour fluidifier le propos.")

    # 4. Connecteurs logiques (20 pts)
    texte_min = texte.lower()
    connecteurs_trouves = sorted({c for c in CONNECTEURS if c in texte_min})
    nb_conn = len(connecteurs_trouves)
    if nb_conn >= 4:
        score_connecteurs = 20
        points_forts.append(f"Argumentation bien articulée ({nb_conn} connecteurs logiques).")
    elif nb_conn >= 2:
        score_connecteurs = 12
        suggestions.append("Utilise plus de connecteurs logiques (d'abord, ensuite, par conséquent…).")
    else:
        score_connecteurs = 5
        suggestions.append("Ajoute des connecteurs logiques pour relier tes idées.")

    # 5. Richesse lexicale (10 pts) — ratio de mots uniques
    diversite = (len(set(m.lower() for m in mots)) / nb_mots) if nb_mots else 0
    if diversite >= 0.55:
        score_lexique = 10
        points_forts.append("Vocabulaire varié.")
    else:
        score_lexique = round(10 * diversite / 0.55) if diversite else 0
        suggestions.append("Varie ton vocabulaire : évite les répétitions.")

    score = score_longueur + score_structure + score_phrases + score_connecteurs + score_lexique
    score = max(0, min(100, score))

    if score >= 80:
        appreciation = "Excellent travail ! Ta production est solide et bien construite."
    elif score >= 60:
        appreciation = "Bon travail. Quelques améliorations te feront progresser."
    elif score >= 40:
        appreciation = "Travail correct mais perfectible. Suis les conseils ci-dessous."
    else:
        appreciation = "Il y a du travail. Reprends les points indiqués pour t'améliorer."

    return {
        'score': score,
        'appreciation': appreciation,
        'statistiques': {
            'nb_mots': nb_mots,
            'nb_phrases': nb_phrases,
            'nb_paragraphes': nb_paragraphes,
            'longueur_moyenne_phrase': round(moy_mots_phrase, 1),
            'diversite_lexicale': round(diversite * 100),
            'connecteurs_utilises': connecteurs_trouves,
        },
        'points_forts': points_forts,
        'suggestions': suggestions,
        'detail_score': {
            'longueur': score_longueur,
            'structure': score_structure,
            'phrases': score_phrases,
            'connecteurs': score_connecteurs,
            'lexique': score_lexique,
        },
    }


class RedactionAnalyseView(APIView):
    """POST un texte → renvoie un score d'expression détaillé."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        texte = (request.data.get('texte') or '').strip()
        type_exercice = request.data.get('type_exercice', 'redaction')

        if len(texte) < 20:
            return Response(
                {"error": "Le texte est trop court pour être analysé (20 caractères minimum)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if type_exercice not in TYPE_CHOICES:
            type_exercice = 'redaction'

        resultat = analyser_texte(texte, type_exercice)
        resultat['type_exercice'] = type_exercice
        from school import ai_service
        resultat['ia_disponible'] = ai_service.is_configured()
        return Response(resultat, status=status.HTTP_200_OK)
