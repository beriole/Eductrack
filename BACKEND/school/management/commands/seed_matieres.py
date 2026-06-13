from django.core.management.base import BaseCommand
from school.models import Matieres


MATIERES_DATA = [
    {
        'nom': 'Mathématiques',
        'code': 'MATH',
        'langue': 'fr',
        'niveaux': ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Tle'],
        'series': ['A1', 'A4', 'C', 'D', 'TI'],
        'coefficient_max': 7,
    },
    {
        'nom': 'Physique-Chimie',
        'code': 'PHYS',
        'langue': 'fr',
        'niveaux': ['4eme', '3eme', '2nde', '1ere', 'Tle'],
        'series': ['C', 'D', 'TI'],
        'coefficient_max': 6,
    },
    {
        'nom': 'Sciences de la Vie et de la Terre',
        'code': 'SVT',
        'langue': 'fr',
        'niveaux': ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Tle'],
        'series': ['C', 'D'],
        'coefficient_max': 6,
    },
    {
        'nom': 'Français',
        'code': 'FRAN',
        'langue': 'fr',
        'niveaux': ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Tle'],
        'series': ['A1', 'A4', 'C', 'D', 'E', 'TI'],
        'coefficient_max': 4,
    },
    {
        'nom': 'Philosophie',
        'code': 'PHILO',
        'langue': 'fr',
        'niveaux': ['Tle'],
        'series': ['A1', 'A4', 'C', 'D', 'E', 'TI'],
        'coefficient_max': 3,
    },
    {
        'nom': 'Histoire-Géographie',
        'code': 'HG',
        'langue': 'fr',
        'niveaux': ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Tle'],
        'series': ['A1', 'A4', 'C', 'D'],
        'coefficient_max': 3,
    },
    {
        'nom': 'Économie',
        'code': 'ECO',
        'langue': 'fr',
        'niveaux': ['2nde', '1ere', 'Tle'],
        'series': ['A4', 'C', 'D'],
        'coefficient_max': 3,
    },
    {
        'nom': 'Anglais',
        'code': 'ANG',
        'langue': 'fr_en',
        'niveaux': ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Tle'],
        'series': ['A1', 'A4', 'C', 'D', 'E', 'TI'],
        'coefficient_max': 4,
    },
    {
        'nom': 'Informatique',
        'code': 'INFO',
        'langue': 'fr',
        'niveaux': ['2nde', '1ere', 'Tle'],
        'series': ['TI', 'C', 'D'],
        'coefficient_max': 5,
    },
    {
        'nom': 'Sciences Techniques Industrielles',
        'code': 'STI',
        'langue': 'fr',
        'niveaux': ['2nde', '1ere', 'Tle'],
        'series': ['TI'],
        'coefficient_max': 6,
    },
    {
        'nom': 'Mathematics (GCE)',
        'code': 'MATH_EN',
        'langue': 'en',
        'niveaux': ['Form4', 'Form5', 'LowerSixth', 'UpperSixth'],
        'series': ['A_LEVEL', 'O_LEVEL'],
        'coefficient_max': 6,
    },
    {
        'nom': 'Further Mathematics (GCE)',
        'code': 'FMATH_EN',
        'langue': 'en',
        'niveaux': ['LowerSixth', 'UpperSixth'],
        'series': ['A_LEVEL'],
        'coefficient_max': 5,
    },
]


class Command(BaseCommand):
    help = 'Seed les matières du programme MINESEC / OBC / GCE Board'

    def handle(self, *args, **options):
        created = 0
        updated = 0

        for data in MATIERES_DATA:
            obj, was_created = Matieres.objects.update_or_create(
                code=data['code'],
                defaults=data,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'Seed terminé — {created} matières créées, {updated} mises à jour.'
        ))
