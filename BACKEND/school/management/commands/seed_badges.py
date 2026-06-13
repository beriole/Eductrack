from django.core.management.base import BaseCommand
from school.models import Badges


BADGES_DATA = [
    {
        'nom': 'Premier Pas',
        'description': 'Complète ta première session d\'étude',
        'categorie': 'progression',
        'valeur_points': 10,
        'critere_json': {'type': 'sessions_count', 'valeur': 1},
    },
    {
        'nom': 'Semaine Parfaite',
        'description': '7 jours d\'étude consécutifs',
        'categorie': 'regularite',
        'valeur_points': 50,
        'critere_json': {'type': 'streak_jours', 'valeur': 7},
    },
    {
        'nom': 'Mois de Feu',
        'description': '30 jours d\'étude consécutifs',
        'categorie': 'regularite',
        'valeur_points': 200,
        'critere_json': {'type': 'streak_jours', 'valeur': 30},
    },
    {
        'nom': 'Expert Maths',
        'description': 'Score supérieur à 80% en simulation Mathématiques',
        'categorie': 'performance',
        'valeur_points': 75,
        'critere_json': {'type': 'score_matiere', 'matiere': 'MATH', 'valeur': 80},
    },
    {
        'nom': 'Expert Physique',
        'description': 'Score supérieur à 80% en simulation Physique-Chimie',
        'categorie': 'performance',
        'valeur_points': 75,
        'critere_json': {'type': 'score_matiere', 'matiere': 'PHYS', 'valeur': 80},
    },
    {
        'nom': 'Expert SVT',
        'description': 'Score supérieur à 80% en simulation SVT',
        'categorie': 'performance',
        'valeur_points': 75,
        'critere_json': {'type': 'score_matiere', 'matiere': 'SVT', 'valeur': 80},
    },
    {
        'nom': 'Toutes Lacunes Comblées',
        'description': 'Résous 10 lacunes critiques',
        'categorie': 'progression',
        'valeur_points': 100,
        'critere_json': {'type': 'lacunes_resolues', 'valeur': 10},
    },
    {
        'nom': 'Marathonien',
        'description': 'Complète 50 sessions d\'étude au total',
        'categorie': 'regularite',
        'valeur_points': 150,
        'critere_json': {'type': 'sessions_count', 'valeur': 50},
    },
    {
        'nom': 'Focus Master',
        'description': 'Complète 10 sessions Pomodoro de 45 min',
        'categorie': 'regularite',
        'valeur_points': 60,
        'critere_json': {'type': 'pomodoro_count', 'duree_min': 45, 'valeur': 10},
    },
    {
        'nom': 'Premier Examen',
        'description': 'Complète ton premier examen blanc',
        'categorie': 'progression',
        'valeur_points': 25,
        'critere_json': {'type': 'examens_blancs', 'valeur': 1},
    },
    {
        'nom': 'Major de Promo',
        'description': 'Atteins le top 10 du classement national',
        'categorie': 'performance',
        'valeur_points': 300,
        'critere_json': {'type': 'classement_national', 'valeur': 10},
    },
    {
        'nom': 'Ambassadeur',
        'description': 'Lier 3 parents à ton compte élève',
        'categorie': 'special',
        'valeur_points': 30,
        'critere_json': {'type': 'liens_parents', 'valeur': 1},
    },
    {
        'nom': 'Noctambule',
        'description': 'Complète une session d\'étude après 22h',
        'categorie': 'special',
        'valeur_points': 20,
        'critere_json': {'type': 'session_nuit', 'heure_min': 22},
    },
    {
        'nom': 'Lève-tôt',
        'description': 'Complète une session d\'étude avant 7h du matin',
        'categorie': 'special',
        'valeur_points': 20,
        'critere_json': {'type': 'session_matin', 'heure_max': 7},
    },
    {
        'nom': 'Perfectionniste',
        'description': 'Obtiens 20/20 à un examen blanc',
        'categorie': 'performance',
        'valeur_points': 200,
        'critere_json': {'type': 'score_parfait', 'valeur': 100},
    },
    {
        'nom': 'Micro-Révision Champion',
        'description': 'Complète 30 jours consécutifs de micro-révisions',
        'categorie': 'regularite',
        'valeur_points': 100,
        'critere_json': {'type': 'microrevision_streak', 'valeur': 30},
    },
    {
        'nom': 'Polymathe',
        'description': 'Score > 70% dans 5 matières différentes',
        'categorie': 'performance',
        'valeur_points': 150,
        'critere_json': {'type': 'score_multi_matieres', 'valeur': 70, 'nb_matieres': 5},
    },
]


class Command(BaseCommand):
    help = 'Seed les 17 badges du système de gamification'

    def handle(self, *args, **options):
        created = 0
        updated = 0

        for data in BADGES_DATA:
            obj, was_created = Badges.objects.update_or_create(
                nom=data['nom'],
                defaults=data,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'Seed terminé — {created} badges créés, {updated} mis à jour.'
        ))
