"""Moteur de détection de lacunes transversale (Module 9).

Analyse TOUTES les réponses corrigées d'un élève, à travers l'ensemble de ses
sessions et matières, pour mesurer un taux de maîtrise réel par matière. Les
lacunes sont créées, mises à jour ou marquées « maîtrisées » automatiquement,
sans intervention du frontend.

Granularité : la maîtrise est calculée par matière (les questions ne portant
pas de champ chapitre/notion), avec une ventilation par difficulté qui sert à
qualifier la lacune (ex. « Questions difficiles »).
"""
import logging

from django.db.models import Count, Q
from django.utils import timezone

from school.models import Reponses, Matieres, Lacunes

logger = logging.getLogger(__name__)

# Nombre minimal de réponses corrigées dans une matière avant de juger.
SEUIL_MIN_REPONSES = 4
# Seuils de taux de maîtrise (en %).
SEUIL_DETECTEE = 50      # < 50 % → lacune « détectée » (prioritaire)
SEUIL_MAITRISE = 75      # >= 75 % → notion considérée maîtrisée
# Entre les deux → « en cours ».

# Libellé stable pour les lacunes auto-détectées : sert de clé d'idempotence et
# les distingue des lacunes issues d'un diagnostic (qui portent un vrai nom).
NOTION_AUTO = "Maîtrise globale"
CHAPITRE_AUTO = "Évaluation continue"

DIFFICULTE_LABELS = {
    'facile': 'Questions faciles',
    'moyen': 'Questions de difficulté moyenne',
    'difficile': 'Questions difficiles',
}


def _stats_par_matiere(eleve):
    """Renvoie {matiere_id: {'total', 'correctes'}} sur toutes les réponses corrigées."""
    lignes = (
        Reponses.objects
        .filter(id_session__id_eleve=eleve, est_correcte__isnull=False)
        .values('id_question__id_epreuve__id_matiere')
        .annotate(
            total=Count('id_reponse'),
            correctes=Count('id_reponse', filter=Q(est_correcte=True)),
        )
    )
    return {
        l['id_question__id_epreuve__id_matiere']: {
            'total': l['total'], 'correctes': l['correctes'],
        }
        for l in lignes if l['id_question__id_epreuve__id_matiere'] is not None
    }


def _difficulte_la_plus_faible(eleve, matiere_id):
    """Renvoie le libellé de la difficulté où l'élève réussit le moins (ou None)."""
    lignes = (
        Reponses.objects
        .filter(
            id_session__id_eleve=eleve,
            est_correcte__isnull=False,
            id_question__id_epreuve__id_matiere=matiere_id,
        )
        .values('id_question__difficulte')
        .annotate(
            total=Count('id_reponse'),
            correctes=Count('id_reponse', filter=Q(est_correcte=True)),
        )
    )
    pire_taux = None
    pire_diff = None
    for l in lignes:
        if not l['total']:
            continue
        taux = l['correctes'] / l['total']
        if pire_taux is None or taux < pire_taux:
            pire_taux = taux
            pire_diff = l['id_question__difficulte']
    return DIFFICULTE_LABELS.get(pire_diff)


def detecter_lacunes_transversales(eleve):
    """Détecte/actualise les lacunes d'un élève à partir de ses résultats réels.

    Renvoie un récapitulatif : {'detectees', 'en_cours', 'maitrisees', 'ignorees'}.
    Idempotent : appelable après chaque session sans créer de doublons.
    """
    stats = _stats_par_matiere(eleve)
    if not stats:
        return {'detectees': 0, 'en_cours': 0, 'maitrisees': 0, 'ignorees': 0}

    matieres = Matieres.objects.in_bulk(stats.keys())
    recap = {'detectees': 0, 'en_cours': 0, 'maitrisees': 0, 'ignorees': 0}
    now = timezone.now()

    for matiere_id, s in stats.items():
        matiere = matieres.get(matiere_id)
        if matiere is None:
            continue

        # Pas assez de données pour juger : on ne crée pas de lacune.
        if s['total'] < SEUIL_MIN_REPONSES:
            recap['ignorees'] += 1
            continue

        taux = round(s['correctes'] / s['total'] * 100, 2)

        if taux < SEUIL_DETECTEE:
            statut = 'detectee'
        elif taux < SEUIL_MAITRISE:
            statut = 'en_cours'
        else:
            statut = 'maitrisee'

        lacune, _cree = Lacunes.objects.get_or_create(
            id_eleve=eleve,
            id_matiere=matiere,
            notion=NOTION_AUTO,
            defaults={'chapitre': CHAPITRE_AUTO},
        )

        # Qualifie la lacune par la difficulté la plus faible (info utile, réelle).
        pire = _difficulte_la_plus_faible(eleve, matiere_id)
        lacune.chapitre = pire or CHAPITRE_AUTO
        lacune.taux_maitrise = taux
        lacune.nb_exercices_faits = s['total']

        # Transition de statut : on horodate le passage à « maîtrisée ».
        if statut == 'maitrisee' and lacune.statut != 'maitrisee':
            lacune.date_maitrise = now
        elif statut != 'maitrisee':
            lacune.date_maitrise = None
        lacune.statut = statut

        lacune.save(update_fields=[
            'chapitre', 'taux_maitrise', 'nb_exercices_faits', 'statut', 'date_maitrise',
        ])

        recap[
            'maitrisees' if statut == 'maitrisee'
            else 'en_cours' if statut == 'en_cours'
            else 'detectees'
        ] += 1

    return recap
