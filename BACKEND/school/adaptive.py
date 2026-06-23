"""Moteur d'apprentissage adaptatif — répétition espacée (SM-2).

Chaque lacune (notion non maîtrisée) est planifiée dans le temps : plus l'élève
réussit, plus l'intervalle avant la prochaine révision s'allonge ; un échec
remet la notion à réviser dès le lendemain. C'est l'algorithme SM-2 (SuperMemo).
"""
import datetime
from django.utils import timezone


def note_vers_qualite(note_sur_20):
    """Convertit une note /20 en qualité SM-2 (0 à 5)."""
    if note_sur_20 is None:
        return 3
    return max(0, min(5, round(float(note_sur_20) / 4)))


def appliquer_sm2(lacune, qualite, today=None):
    """Met à jour la planification d'une lacune selon la qualité de réponse (0-5).

    - qualite < 3 (échec) : on repart à zéro, révision dès le lendemain.
    - qualite >= 3 (réussite) : l'intervalle grandit (1 → 3 → ×facilité).
    Met aussi à jour le taux de maîtrise et le statut.
    """
    today = today or timezone.localdate()
    ef = float(lacune.facilite or 2.5)
    reps = lacune.repetitions or 0
    interval = lacune.intervalle_jours or 0

    if qualite < 3:
        reps = 0
        interval = 1
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 3
        else:
            interval = max(1, round(interval * ef))
        reps += 1

    # Mise à jour du facteur de facilité (borné à 1.3).
    ef = ef + (0.1 - (5 - qualite) * (0.08 + (5 - qualite) * 0.02))
    ef = max(1.3, round(ef, 2))

    lacune.facilite = ef
    lacune.repetitions = reps
    lacune.intervalle_jours = max(1, interval)
    lacune.prochaine_revision = today + datetime.timedelta(days=lacune.intervalle_jours)
    lacune.nb_exercices_faits = (lacune.nb_exercices_faits or 0) + 1

    # Taux de maîtrise : moyenne glissante vers la performance courante.
    cible = qualite * 20  # 0..100
    actuel = float(lacune.taux_maitrise or 0)
    lacune.taux_maitrise = round(actuel + (cible - actuel) * 0.5, 2)

    if qualite >= 4 and reps >= 3 and lacune.taux_maitrise >= 80:
        lacune.statut = 'maitrisee'
        lacune.date_maitrise = timezone.now()
    elif qualite < 3:
        # Échec : la notion est rouverte même si elle était maîtrisée.
        lacune.statut = 'en_cours'
        lacune.date_maitrise = None
    elif lacune.statut == 'detectee':
        lacune.statut = 'en_cours'

    lacune.save(update_fields=[
        'facilite', 'repetitions', 'intervalle_jours', 'prochaine_revision',
        'nb_exercices_faits', 'taux_maitrise', 'statut', 'date_maitrise',
    ])
    return lacune
