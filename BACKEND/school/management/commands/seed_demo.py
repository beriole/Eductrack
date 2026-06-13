"""Peuple la base avec un jeu de données de démonstration réaliste.

Crée trois comptes liés (élève, parent, enseignant) et tout l'historique
nécessaire pour une soutenance : épreuves, questions, sessions notées,
lacunes, diagnostic, badges gagnés, sessions focus et planning d'étude.

Usage :
    python manage.py seed_demo            # crée ou met à jour la démo
    python manage.py seed_demo --reset    # supprime d'abord les comptes démo
"""
import datetime
import random

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from school.models import (
    Eleves, Parents, Enseignants, EleveParent, Matieres, Cours,
    Epreuves, Questions, SessionsExamen, Reponses, Diagnostics, Lacunes,
    Badges, EleveBadges, SessionsFocus, PlanningsEtude, SessionsEtude,
)

DEMO_PASSWORD = 'Demo1234!'
ELEVE_EMAIL = 'demo.eleve@edutrack.cm'
PARENT_EMAIL = 'demo.parent@edutrack.cm'
PROF_EMAIL = 'demo.prof@edutrack.cm'


class Command(BaseCommand):
    help = "Crée un jeu de données de démonstration complet pour la soutenance."

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset', action='store_true',
            help='Supprime les comptes de démo existants avant de recréer.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['reset']:
            self._reset()

        matieres = self._ensure_matieres()
        eleve = self._creer_eleve()
        parent = self._creer_parent(eleve)
        prof = self._creer_enseignant()

        self._creer_cours(prof, matieres)
        epreuves = self._creer_epreuves(prof, matieres)
        self._creer_sessions(eleve, epreuves)
        diagnostic = self._creer_diagnostic(eleve, matieres)
        self._creer_lacunes(eleve, matieres, diagnostic)
        self._attribuer_badges(eleve)
        self._creer_focus(eleve, matieres)
        self._creer_planning(eleve, matieres)

        self.stdout.write(self.style.SUCCESS(
            "\n[OK] Demo prete !\n"
            f"   Eleve      : {ELEVE_EMAIL}  /  {DEMO_PASSWORD}\n"
            f"   Parent     : {PARENT_EMAIL}  /  {DEMO_PASSWORD}\n"
            f"   Enseignant : {PROF_EMAIL}  /  {DEMO_PASSWORD}\n"
        ))

    # ── Réinitialisation ──────────────────────────────────────────────────────
    def _reset(self):
        for email in (ELEVE_EMAIL, PARENT_EMAIL, PROF_EMAIL):
            qs = Eleves.objects.filter(email=email)
            if qs.exists():
                qs.delete()
            for model in (Parents, Enseignants):
                model.objects.filter(email=email).delete()
        self.stdout.write(self.style.WARNING('Comptes de démo supprimés.'))

    # ── Matières ──────────────────────────────────────────────────────────────
    def _ensure_matieres(self):
        base = [
            ('Mathématiques', 'MATH', 7),
            ('Physique-Chimie', 'PHYS', 6),
            ('Sciences de la Vie et de la Terre', 'SVT', 6),
            ('Français', 'FRAN', 4),
        ]
        result = {}
        for nom, code, coef in base:
            obj, _ = Matieres.objects.get_or_create(
                code=code,
                defaults={
                    'nom': nom, 'langue': 'fr',
                    'niveaux': ['2nde', '1ere', 'Tle'],
                    'series': ['C', 'D'], 'coefficient_max': coef, 'actif': True,
                },
            )
            result[code] = obj
        return result

    # ── Comptes ───────────────────────────────────────────────────────────────
    def _creer_eleve(self):
        eleve, created = Eleves.objects.get_or_create(
            email=ELEVE_EMAIL,
            defaults={
                'username': ELEVE_EMAIL, 'nom': 'Nkeng', 'prenom': 'Aristide',
                'telephone': '+237690000901', 'role': 'eleve',
                'niveau_scolaire': 'Tle', 'serie': 'D', 'region': 'Centre',
                'ville': 'Yaoundé', 'etablissement': 'Lycée de Biyem-Assi',
                'email_verifie': True,
            },
        )
        if created:
            eleve.set_password(DEMO_PASSWORD)
        eleve.score_global = 68
        eleve.streak_jours = 5
        eleve.points_gamification = 450
        eleve.date_diagnostic = timezone.now().date() - datetime.timedelta(days=20)
        eleve.save()
        return eleve

    def _creer_parent(self, eleve):
        parent, created = Parents.objects.get_or_create(
            email=PARENT_EMAIL,
            defaults={
                'username': PARENT_EMAIL, 'nom': 'Nkeng', 'prenom': 'Brigitte',
                'telephone': '+237690000902', 'role': 'parent',
                'email_verifie': True,
            },
        )
        if created:
            parent.set_password(DEMO_PASSWORD)
            parent.save()
        EleveParent.objects.get_or_create(
            id_eleve=eleve, id_parent=parent, defaults={'lien': 'parent'},
        )
        return parent

    def _creer_enseignant(self):
        prof, created = Enseignants.objects.get_or_create(
            email=PROF_EMAIL,
            defaults={
                'username': PROF_EMAIL, 'nom': 'Tchoua', 'prenom': 'Emmanuel',
                'telephone': '+237690000903', 'role': 'enseignant',
                'specialite': 'Mathématiques', 'diplome': 'DIPES II',
                'etablissement': 'Lycée de Biyem-Assi', 'verifie': True,
                'email_verifie': True,
            },
        )
        if created:
            prof.set_password(DEMO_PASSWORD)
            prof.save()
        return prof

    # ── Contenus ──────────────────────────────────────────────────────────────
    def _creer_cours(self, prof, matieres):
        cours_data = [
            ('MATH', 'Les fonctions numériques', 'Étude des limites, continuité et dérivabilité.'),
            ('PHYS', 'Les ondes mécaniques', 'Propagation, célérité et phénomènes vibratoires.'),
            ('SVT', 'La transmission de la vie', "Méiose, brassage génétique et hérédité."),
        ]
        for code, titre, contenu in cours_data:
            Cours.objects.get_or_create(
                titre=titre, id_enseignant=prof,
                defaults={
                    'id_matiere': matieres[code], 'contenu': contenu,
                    'niveau': 'Tle', 'serie': 'D', 'langue': 'fr',
                    'statut': 'publie', 'valide': True, 'nb_vues': random.randint(20, 200),
                    'date_publication': timezone.now() - datetime.timedelta(days=random.randint(1, 30)),
                },
            )

    def _creer_epreuves(self, prof, matieres):
        epreuves = {}
        specs = [
            ('MATH', 'BAC Blanc Mathématiques — Série D', 'simulation'),
            ('PHYS', 'Épreuve Physique-Chimie 2023', 'officielle'),
            ('SVT', 'Contrôle SVT — Génétique', 'exercice'),
        ]
        for code, titre, type_ep in specs:
            epreuve, created = Epreuves.objects.get_or_create(
                titre=titre, id_matiere=matieres[code],
                defaults={
                    'id_enseignant': prof, 'type_epreuve': type_ep,
                    'niveau': 'Tle', 'serie': 'D', 'annee': 2023,
                    'duree_minutes': 180, 'langue': 'fr', 'statut': 'actif',
                },
            )
            if created or epreuve.questions.count() == 0:
                self._creer_questions(epreuve)
            epreuve.nb_questions = epreuve.questions.count()
            epreuve.save(update_fields=['nb_questions'])
            epreuves[code] = epreuve
        return epreuves

    def _creer_questions(self, epreuve):
        for i in range(1, 6):
            Questions.objects.get_or_create(
                id_epreuve=epreuve, numero_ordre=i,
                defaults={
                    'enonce': f"Question {i} de l'épreuve « {epreuve.titre} » ?",
                    'type_question': 'qcm',
                    'options': ['Réponse A', 'Réponse B', 'Réponse C', 'Réponse D'],
                    'reponse_correcte': 'Réponse A',
                    'points': 4.0, 'difficulte': random.choice(['facile', 'moyen', 'difficile']),
                    'explication': "La bonne réponse est A car elle respecte la définition du cours.",
                },
            )

    # ── Historique élève ──────────────────────────────────────────────────────
    def _creer_sessions(self, eleve, epreuves):
        notes = [14.5, 9.0, 16.0, 11.5, 7.5, 13.0]
        codes = list(epreuves.keys())
        for idx, note in enumerate(notes):
            epreuve = epreuves[codes[idx % len(codes)]]
            jours = 18 - idx * 3
            debut = timezone.now() - datetime.timedelta(days=jours, hours=2)
            nb_q = epreuve.questions.count() or 5
            bonnes = round(note / 20 * nb_q)
            session, created = SessionsExamen.objects.get_or_create(
                id_eleve=eleve, id_epreuve=epreuve, date_debut=debut,
                defaults={
                    'mode': 'simulation', 'statut': 'termine',
                    'date_fin': debut + datetime.timedelta(minutes=random.randint(40, 120)),
                    'duree_reelle_sec': random.randint(2400, 7200),
                    'note_obtenue': note, 'nb_questions': nb_q, 'nb_bonnes_reponses': bonnes,
                },
            )

    def _creer_diagnostic(self, eleve, matieres):
        diag = Diagnostics.objects.filter(id_eleve=eleve).first()
        if diag is None:
            diag = Diagnostics.objects.create(
                id_eleve=eleve,
                score_global=62.0,
                scores_par_matiere={'MATH': 70, 'PHYS': 55, 'SVT': 48, 'FRAN': 75},
                matieres_testees=['MATH', 'PHYS', 'SVT', 'FRAN'],
                parcours_genere=True, nb_lacunes_detectees=3,
            )
        return diag

    def _creer_lacunes(self, eleve, matieres, diagnostic):
        data = [
            ('PHYS', 'Électromagnétisme', "Loi de Lenz-Faraday", 45, 'detectee'),
            ('SVT', 'Génétique', "Brassage interchromosomique", 38, 'en_cours'),
            ('MATH', 'Analyse', "Étude de fonctions exponentielles", 58, 'en_cours'),
            ('MATH', 'Probabilités', "Lois de probabilité continues", 82, 'maitrisee'),
        ]
        for code, chapitre, notion, taux, statut in data:
            Lacunes.objects.get_or_create(
                id_eleve=eleve, id_matiere=matieres[code], notion=notion,
                defaults={
                    'id_diagnostic': diagnostic, 'chapitre': chapitre,
                    'taux_maitrise': taux, 'statut': statut,
                    'nb_exercices_faits': random.randint(0, 8),
                },
            )

    def _attribuer_badges(self, eleve):
        noms = ['Premier Pas', 'Semaine Parfaite', 'Premier Examen']
        for nom in noms:
            badge = Badges.objects.filter(nom=nom).first()
            if badge:
                EleveBadges.objects.get_or_create(id_eleve=eleve, id_badge=badge)

    def _creer_focus(self, eleve, matieres):
        for jours, nb in [(2, 4), (1, 3)]:
            debut = timezone.now() - datetime.timedelta(days=jours)
            SessionsFocus.objects.get_or_create(
                id_eleve=eleve, date_debut=debut,
                defaults={
                    'duree_pomodoro_min': 25, 'nb_sessions': nb,
                    'temps_total_min': nb * 25, 'id_matiere': matieres['MATH'],
                    'date_fin': debut + datetime.timedelta(minutes=nb * 30),
                },
            )

    def _creer_planning(self, eleve, matieres):
        PlanningsEtude.objects.filter(id_eleve=eleve).update(actif=False)
        lundi = timezone.now().date() - datetime.timedelta(days=timezone.now().weekday())
        planning = PlanningsEtude.objects.create(
            id_eleve=eleve, semaine_debut=lundi,
            disponibilites={'lundi': ['18:00', '20:00'], 'mercredi': ['16:00', '18:00'],
                            'samedi': ['09:00', '12:00']},
            priorites_matieres=['PHYS', 'SVT', 'MATH'], actif=True, nb_sessions=3,
        )
        codes = ['PHYS', 'SVT', 'MATH']
        offsets = [(0, 18), (2, 16), (5, 9)]
        for code, (day_offset, hour) in zip(codes, offsets):
            date_h = timezone.make_aware(
                datetime.datetime.combine(
                    lundi + datetime.timedelta(days=day_offset),
                    datetime.time(hour, 0),
                )
            )
            SessionsEtude.objects.create(
                id_planning=planning, id_matiere=matieres[code],
                date_heure=date_h, duree_minutes=90,
                objectif=f"Réviser {matieres[code].nom}", completee=(code == 'PHYS'),
            )
