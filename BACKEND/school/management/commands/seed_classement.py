"""Peuple le classement (leaderboard) avec des élèves de démonstration.

Crée une vingtaine d'élèves réalistes (noms camerounais) répartis sur
plusieurs régions et niveaux, avec des points de gamification variés, afin
que la page « Top » (podium + liste) soit bien remplie pour la soutenance.

Usage :
    python manage.py seed_classement
    python manage.py seed_classement --reset   # supprime d'abord ces élèves
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from school.models import Eleves

DEMO_PASSWORD = 'Demo1234!'
EMAIL_SUFFIX = '@classement.smartschool.cm'

# (prénom, nom, niveau, série, région, ville, points)
ELEVES = [
    ('Marie',     'Atangana',  'Tle',  'D', 'Centre',        'Yaoundé',   1480),
    ('Junior',    'Fotso',     'Tle',  'C', 'Ouest',         'Bafoussam', 1325),
    ('Aïcha',     'Bello',     '1ere', 'D', 'Nord',          'Garoua',    1190),
    ('Steve',     'Mbarga',    'Tle',  'C', 'Centre',        'Yaoundé',   1075),
    ('Larissa',   'Ngono',     '1ere', 'D', 'Littoral',      'Douala',     980),
    ('Cédric',    'Kamga',     'Tle',  'D', 'Ouest',         'Dschang',    910),
    ('Nadège',    'Eyenga',    '2nde', 'C', 'Centre',        'Mbalmayo',   845),
    ('Patrick',   'Njoya',     '1ere', 'C', 'Ouest',         'Foumban',    790),
    ('Sandrine',  'Manga',     'Tle',  'D', 'Sud',           'Ebolowa',    720),
    ('Boris',     'Tchakoute', '3e',   '',  'Littoral',      'Douala',     665),
    ('Estelle',   'Owona',     'Tle',  'C', 'Centre',        'Yaoundé',    610),
    ('Yannick',   'Essomba',   '1ere', 'D', 'Sud-Ouest',     'Buéa',       560),
    ('Carine',    'Ndongo',    '2nde', 'D', 'Est',           'Bertoua',    505),
    ('Ulrich',    'Foe',       'Tle',  'C', 'Adamaoua',      'Ngaoundéré', 460),
    ('Brenda',    'Achu',      '1ere', 'D', 'Nord-Ouest',    'Bamenda',    395),
    ('Hervé',     'Mvondo',    '3e',   '',  'Centre',        'Yaoundé',    340),
    ('Diane',     'Tagne',     '2nde', 'C', 'Ouest',         'Bafoussam',  285),
    ('Franck',    'Onana',     '4e',   '',  'Centre',        'Yaoundé',    230),
    ('Mireille',  'Ebai',      '1ere', 'D', 'Sud-Ouest',     'Kumba',      175),
    ('Joël',      'Biya',      '5e',   '',  'Littoral',      'Édéa',       120),
]


class Command(BaseCommand):
    help = "Crée des élèves de démonstration pour remplir le classement."

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true',
                            help='Supprime les élèves de classement existants.')

    @transaction.atomic
    def handle(self, *args, **options):
        if options['reset']:
            n, _ = Eleves.objects.filter(email__endswith=EMAIL_SUFFIX).delete()
            self.stdout.write(self.style.WARNING(f'{n} entrées supprimées.'))

        crees = 0
        for prenom, nom, niveau, serie, region, ville, points in ELEVES:
            email = f'{prenom}.{nom}{EMAIL_SUFFIX}'.lower().replace(' ', '')
            eleve, created = Eleves.objects.get_or_create(
                email=email,
                defaults={
                    'username': email, 'nom': nom, 'prenom': prenom,
                    'role': 'eleve', 'niveau_scolaire': niveau, 'serie': serie,
                    'region': region, 'ville': ville,
                    'etablissement': f'Lycée de {ville}',
                    'email_verifie': True, 'actif': True,
                },
            )
            if created:
                eleve.set_password(DEMO_PASSWORD)
                crees += 1
            eleve.points_gamification = points
            eleve.score_global = min(100, 40 + points // 30)
            eleve.actif = True
            eleve.save()

        total = Eleves.objects.filter(actif=True).count()
        self.stdout.write(self.style.SUCCESS(
            f"\n[OK] Classement peuplé : {crees} nouveaux élèves "
            f"({len(ELEVES)} au total dans le set).\n"
            f"   Élèves actifs en base : {total}\n"
        ))
