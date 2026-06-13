"""Gamification avancée (Module 12) — ligues et défis calculés sur données réelles.

- **Ligues** : paliers déterminés par le total d'XP (points_gamification).
- **Défis** : objectifs (hebdo/quotidien/permanent) dont la progression est
  recalculée à partir des vraies données (sessions, révisions, streak, notes).
  La récompense XP n'est créditée que lorsque l'élève la réclame.
"""
from django.db.models import Max
from django.utils import timezone

from school.models import SessionsExamen, MicroRevisions, Defis, EleveDefis

# Paliers de ligue : (seuil_xp, nom, couleur, icône).
LIGUES = [
    (0, 'Bronze', '#CD7F32', 'shield'),
    (100, 'Argent', '#94A3B8', 'shield-half'),
    (500, 'Or', '#F59E0B', 'trophy'),
    (1500, 'Platine', '#22D3EE', 'diamond'),
    (4000, 'Diamant', '#8B5CF6', 'sparkles'),
]


def info_ligue(points):
    """Renvoie la ligue actuelle de l'élève + sa progression vers la suivante."""
    points = int(points or 0)
    courant = LIGUES[0]
    suivant = None
    for i, palier in enumerate(LIGUES):
        if points >= palier[0]:
            courant = palier
            suivant = LIGUES[i + 1] if i + 1 < len(LIGUES) else None
        else:
            break

    seuil_courant = courant[0]
    if suivant:
        seuil_suivant = suivant[0]
        span = seuil_suivant - seuil_courant
        progression = round((points - seuil_courant) / span * 100) if span else 100
        manquant = seuil_suivant - points
    else:
        seuil_suivant = None
        progression = 100
        manquant = 0

    return {
        'nom': courant[1],
        'couleur': courant[2],
        'icone': courant[3],
        'points': points,
        'palier_actuel': seuil_courant,
        'palier_suivant': seuil_suivant,
        'ligue_suivante': suivant[1] if suivant else None,
        'progression': progression,
        'xp_manquant': max(0, manquant),
    }


def _cle_periode(periode, jour):
    if periode == 'quotidien':
        return jour.isoformat()
    if periode == 'hebdomadaire':
        iso = jour.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    return 'perm'


def _bornes_semaine(jour):
    """(lundi 00:00, lundi suivant) de la semaine ISO contenant `jour`."""
    import datetime
    lundi = jour - datetime.timedelta(days=jour.weekday())
    debut = timezone.make_aware(datetime.datetime.combine(lundi, datetime.time.min))
    return debut, debut + datetime.timedelta(days=7)


def calculer_progression(eleve, defi, jour=None):
    """Mesure la progression réelle de l'élève pour un défi donné."""
    jour = jour or timezone.localdate()
    t = defi.type_cible

    if t == 'sessions_semaine':
        debut, fin = _bornes_semaine(jour)
        return SessionsExamen.objects.filter(
            id_eleve=eleve, statut='termine', date_fin__gte=debut, date_fin__lt=fin).count()

    if t == 'revisions_semaine':
        debut, fin = _bornes_semaine(jour)
        return MicroRevisions.objects.filter(
            id_eleve=eleve, completee=True,
            date_completion__gte=debut, date_completion__lt=fin).count()

    if t == 'streak':
        return int(eleve.streak_jours or 0)

    if t == 'exercices_total':
        return SessionsExamen.objects.filter(id_eleve=eleve, statut='termine').count()

    if t == 'score_max':
        m = SessionsExamen.objects.filter(
            id_eleve=eleve, statut='termine').aggregate(m=Max('note_obtenue'))['m']
        return int(m or 0)

    return 0


def synchroniser_defis(eleve, jour=None):
    """Recalcule la progression de tous les défis actifs et renvoie leur état."""
    jour = jour or timezone.localdate()
    now = timezone.now()
    resultats = []
    for defi in Defis.objects.filter(actif=True).order_by('periode', 'seuil'):
        cle = _cle_periode(defi.periode, jour)
        ed, _ = EleveDefis.objects.get_or_create(
            id_eleve=eleve, id_defi=defi, periode_cle=cle)

        progression = calculer_progression(eleve, defi, jour)
        ed.progression = progression
        if progression >= defi.seuil and not ed.complete:
            ed.complete = True
            ed.date_completion = now
        # Si la donnée régresse (nouvelle période), on ne « décomplète » pas une
        # période déjà validée ; la clé de période isole chaque cycle.
        ed.save(update_fields=['progression', 'complete', 'date_completion'])

        resultats.append({
            'code': defi.code,
            'titre': defi.titre,
            'description': defi.description,
            'icone': defi.icone,
            'periode': defi.periode,
            'type_cible': defi.type_cible,
            'seuil': defi.seuil,
            'recompense_xp': defi.recompense_xp,
            'progression': min(progression, defi.seuil),
            'progression_reelle': progression,
            'complete': ed.complete,
            'recompense_reclamee': ed.recompense_reclamee,
        })
    return resultats


class DefiError(Exception):
    """Erreur de réclamation de récompense (message lisible)."""


def reclamer_recompense(eleve, code, jour=None):
    """Crédite la récompense XP d'un défi complété et non encore réclamé.

    Renvoie (xp_gagne, xp_total, nouveaux_badges). Lève DefiError sinon."""
    jour = jour or timezone.localdate()
    defi = Defis.objects.filter(code=code, actif=True).first()
    if not defi:
        raise DefiError("Défi introuvable.")

    cle = _cle_periode(defi.periode, jour)
    ed = EleveDefis.objects.filter(id_eleve=eleve, id_defi=defi, periode_cle=cle).first()
    # Resynchronise au cas où la progression n'a pas encore été enregistrée.
    if not ed or not ed.complete:
        progression = calculer_progression(eleve, defi, jour)
        if progression < defi.seuil:
            raise DefiError("Défi non encore complété.")
        if not ed:
            ed = EleveDefis.objects.create(
                id_eleve=eleve, id_defi=defi, periode_cle=cle, progression=progression)
        ed.complete = True
        ed.date_completion = timezone.now()
        ed.save(update_fields=['complete', 'date_completion', 'progression'])

    if ed.recompense_reclamee:
        raise DefiError("Récompense déjà réclamée.")

    ed.recompense_reclamee = True
    ed.save(update_fields=['recompense_reclamee'])

    eleve.points_gamification += defi.recompense_xp
    eleve.save(update_fields=['points_gamification'])

    from school.api_views.gamification_views import evaluer_badges
    nouveaux = evaluer_badges(eleve)
    return defi.recompense_xp, eleve.points_gamification, nouveaux
