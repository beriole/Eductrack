"""Catalogue des matières du programme camerounais.

Couvre les deux sous-systèmes :
  • Francophone (MINESEC) : 1er cycle 6e→3e, 2nd cycle 2nde→Tle (séries A/C/D/E/TI).
  • Anglophone (GCE Board) : O-Level Form 1→5, A-Level Lower/Upper Sixth
    (séries Science / Arts / Commercial).

Les codes de niveau correspondent EXACTEMENT à Eleves.NIVEAU_CHOICES afin que
le filtrage des matières par niveau fonctionne pour chaque élève.

Usage : python manage.py seed_matieres [--reset]
"""
from django.core.management.base import BaseCommand
from school.models import Matieres

# ── Groupes de niveaux ────────────────────────────────────────────────────────
FR_PREMIER = ['6e', '5e', '4e', '3e']
FR_SECOND = ['2nde', '1ere', 'Tle']
FR_ALL = FR_PREMIER + FR_SECOND
EN_OLEVEL = ['Form1', 'Form2', 'Form3', 'Form4', 'Form5']
EN_ALEVEL = ['LowerSixth', 'UpperSixth']
EN_ALL = EN_OLEVEL + EN_ALEVEL

# ── Séries ────────────────────────────────────────────────────────────────────
FR_SCI = ['C', 'D', 'E', 'TI']            # scientifiques / techniques
FR_LIT = ['A1', 'A4']                      # littéraires
FR_TOUTES = ['A1', 'A4', 'C', 'D', 'E', 'TI']
EN_SCIENCE = ['Science']
EN_ARTS = ['Arts']
EN_COMM = ['Commercial']
EN_ALL_SERIES = ['Science', 'Arts', 'Commercial']

# Langues vivantes II : introduites en 4e, poursuivies jusqu'en Tle (séries littéraires au 2nd cycle).
FR_LV2 = ['4e', '3e', '2nde', '1ere', 'Tle']

# (nom, code, langue, niveaux, series, coefficient_max)
MATIERES_DATA = [
    # ─────────────────────── FRANCOPHONE (MINESEC) ───────────────────────
    ('Français', 'FRAN', 'fr', FR_ALL, FR_TOUTES, 6),
    ('Anglais', 'ANGL', 'fr_en', FR_ALL, FR_TOUTES, 4),
    ('Mathématiques', 'MATH', 'fr', FR_ALL, FR_TOUTES, 7),
    ('Sciences de la Vie et de la Terre', 'SVT', 'fr', FR_ALL, ['C', 'D'], 6),
    ('Physique', 'PHY', 'fr', FR_SECOND, FR_SCI, 6),
    ('Chimie', 'CHI', 'fr', FR_SECOND, ['C', 'D'], 4),
    ('Physique-Chimie-Technologie', 'PCT', 'fr', ['4e', '3e'], [], 2),
    ('Histoire-Géographie', 'HG', 'fr', FR_ALL, ['A1', 'A4', 'C', 'D'], 3),
    ('Éducation à la Citoyenneté et à la Morale', 'ECM', 'fr', FR_PREMIER, [], 1),
    ('Philosophie', 'PHIL', 'fr', ['1ere', 'Tle'], FR_TOUTES, 4),
    ('Sciences Économiques et Sociales', 'ECO', 'fr', FR_SECOND, ['A4', 'G'], 4),
    ('Informatique', 'INFO', 'fr', FR_ALL, FR_TOUTES, 4),
    ('Espagnol', 'ESP', 'fr', FR_LV2, FR_LIT, 2),
    ('Allemand', 'ALL', 'fr', FR_LV2, FR_LIT, 2),
    ('Chinois', 'CHIN', 'fr', FR_LV2, FR_LIT, 2),
    ('Arabe', 'ARAB', 'fr', FR_LV2, FR_LIT, 2),
    ('Latin', 'LATIN', 'fr', ['2nde', '1ere', 'Tle'], FR_LIT, 2),
    ('Langues et Cultures Nationales', 'LCN', 'fr', FR_PREMIER, [], 1),
    ('Éducation Artistique', 'ART', 'fr', FR_PREMIER, [], 1),
    ('Éducation Physique et Sportive', 'EPS', 'fr', FR_ALL, FR_TOUTES, 1),

    # ─────────────────────── ANGLOPHONE (GCE Board) ──────────────────────
    ('English Language', 'ENG', 'en', EN_ALL, EN_ALL_SERIES, 6),
    ('Literature in English', 'LITE', 'en', ['Form3', 'Form4', 'Form5'] + EN_ALEVEL, EN_ARTS, 4),
    ('French', 'FRE', 'fr_en', EN_ALL, EN_ALL_SERIES, 3),
    ('Mathematics', 'MATH_EN', 'en', EN_ALL, EN_ALL_SERIES, 6),
    ('Further Mathematics', 'FMATH_EN', 'en', EN_ALEVEL, EN_SCIENCE, 5),
    ('Biology', 'BIO', 'en', ['Form3', 'Form4', 'Form5'] + EN_ALEVEL, EN_SCIENCE, 5),
    ('Chemistry', 'CHEM', 'en', ['Form3', 'Form4', 'Form5'] + EN_ALEVEL, EN_SCIENCE, 5),
    ('Physics', 'PHY_EN', 'en', ['Form3', 'Form4', 'Form5'] + EN_ALEVEL, EN_SCIENCE, 5),
    ('Computer Science', 'CSC', 'en', EN_ALL, EN_ALL_SERIES, 4),
    ('History', 'HIST', 'en', EN_ALL, EN_ARTS, 3),
    ('Geography', 'GEOG', 'en', EN_ALL, ['Arts', 'Science'], 3),
    ('Economics', 'ECON', 'en', ['Form4', 'Form5'] + EN_ALEVEL, ['Commercial', 'Arts'], 4),
    ('Citizenship Education', 'CITZ', 'en', EN_OLEVEL, [], 1),
    ('Commerce', 'COMM', 'en', ['Form4', 'Form5'] + EN_ALEVEL, EN_COMM, 3),
    ('Accounting', 'ACCT', 'en', ['Form4', 'Form5'] + EN_ALEVEL, EN_COMM, 4),
    ('Food Science and Nutrition', 'FSN', 'en', ['Form4', 'Form5'] + EN_ALEVEL, ['Science', 'Arts'], 3),
    ('Logic', 'LOGC', 'en', EN_ALEVEL, EN_ARTS, 3),
    ('Religious Studies', 'RELS', 'en', EN_OLEVEL, EN_ARTS, 2),
]


class Command(BaseCommand):
    help = 'Catalogue des matières MINESEC (FR) et GCE Board (EN).'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true',
                            help='Supprime toutes les matières avant de recréer.')

    def handle(self, *args, **options):
        if options['reset']:
            n, _ = Matieres.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'{n} objets supprimés.'))

        created = updated = 0
        for nom, code, langue, niveaux, series, coef in MATIERES_DATA:
            _, was_created = Matieres.objects.update_or_create(
                code=code,
                defaults={
                    'nom': nom, 'langue': langue, 'niveaux': niveaux,
                    'series': series, 'coefficient_max': coef, 'actif': True,
                },
            )
            created += was_created
            updated += not was_created

        fr = sum(1 for m in MATIERES_DATA if m[2] != 'en')
        en = sum(1 for m in MATIERES_DATA if m[2] == 'en')
        self.stdout.write(self.style.SUCCESS(
            f'Seed terminé — {created} créées, {updated} mises à jour.\n'
            f'  Francophone : {fr} matières  |  Anglophone : {en} matières'
        ))
