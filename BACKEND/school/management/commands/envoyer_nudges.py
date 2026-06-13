"""Déclenche manuellement les rappels d'engagement (style Duolingo).

Utile pour la démo / un cron système, sans avoir à lancer Celery Beat.
En production ces mêmes tâches tournent automatiquement via CELERY_BEAT_SCHEDULE.

Exemples :
    python manage.py envoyer_nudges                 # tous les nudges du jour
    python manage.py envoyer_nudges --type revision # uniquement la révision du jour
    python manage.py envoyer_nudges --type coach
"""
from django.core.management.base import BaseCommand

from school.tasks import (
    rappeler_sessions_du_jour,
    alerter_inactivite,
    envoyer_revisions_quotidiennes,
    coacher_eleves,
    relancer_serie_en_peril,
)

TACHES = {
    'revision': envoyer_revisions_quotidiennes,
    'coach': coacher_eleves,
    'sessions': rappeler_sessions_du_jour,
    'inactivite': alerter_inactivite,
    'serie': relancer_serie_en_peril,
}


class Command(BaseCommand):
    help = "Envoie les rappels d'engagement (révision, coach, sessions, inactivité)."

    def add_arguments(self, parser):
        parser.add_argument('--type', choices=list(TACHES) + ['all'], default='all',
                            help="Type de nudge à envoyer (defaut: all).")

    def handle(self, *args, **options):
        cible = options['type']
        taches = TACHES if cible == 'all' else {cible: TACHES[cible]}
        for nom, tache in taches.items():
            # On appelle la fonction de tâche directement (exécution synchrone).
            resultat = tache()
            self.stdout.write(self.style.SUCCESS(f"[{nom}] {resultat}"))
