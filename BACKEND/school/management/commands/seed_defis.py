"""Seed des défis de gamification (Module 12)."""
from django.core.management.base import BaseCommand

from school.models import Defis

DEFIS = [
    {
        'code': 'sessions_3_semaine', 'titre': 'Marathon de la semaine',
        'description': 'Termine 3 épreuves cette semaine.',
        'type_cible': 'sessions_semaine', 'seuil': 3, 'recompense_xp': 60,
        'periode': 'hebdomadaire', 'icone': 'flame',
    },
    {
        'code': 'revisions_5_semaine', 'titre': 'Régularité',
        'description': 'Fais 5 révisions quotidiennes cette semaine.',
        'type_cible': 'revisions_semaine', 'seuil': 5, 'recompense_xp': 80,
        'periode': 'hebdomadaire', 'icone': 'calendar',
    },
    {
        'code': 'streak_7', 'titre': 'Série de feu',
        'description': 'Atteins une série de 7 jours consécutifs.',
        'type_cible': 'streak', 'seuil': 7, 'recompense_xp': 100,
        'periode': 'permanent', 'icone': 'bonfire',
    },
    {
        'code': 'exercices_20', 'titre': 'Travailleur acharné',
        'description': 'Termine 20 épreuves au total.',
        'type_cible': 'exercices_total', 'seuil': 20, 'recompense_xp': 120,
        'periode': 'permanent', 'icone': 'barbell',
    },
    {
        'code': 'score_15', 'titre': 'Excellence',
        'description': 'Obtiens au moins 15/20 à une épreuve.',
        'type_cible': 'score_max', 'seuil': 15, 'recompense_xp': 90,
        'periode': 'permanent', 'icone': 'ribbon',
    },
]


class Command(BaseCommand):
    help = "Seed les défis de gamification"

    def handle(self, *args, **options):
        crees, maj = 0, 0
        for d in DEFIS:
            _, cree = Defis.objects.update_or_create(
                code=d['code'],
                defaults={k: v for k, v in d.items() if k != 'code'},
            )
            if cree:
                crees += 1
            else:
                maj += 1
        self.stdout.write(self.style.SUCCESS(f"Defis: {crees} cree(s), {maj} mis a jour."))
