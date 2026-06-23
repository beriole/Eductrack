"""Contenu pédagogique initial : cours publiés + exercices par niveau et matière.

Objectif : qu'à la création de son compte, chaque élève dispose déjà de cours et
d'exercices pour SA classe et SON niveau (programme camerounais).

Le contenu est généré (cours structuré + QCM avec corrigé) via le service IA
configuré (Groq). Si l'IA est indisponible, un gabarit de secours est utilisé :
la commande fonctionne donc toujours. Le contenu est ORIGINAL (aucun PDF n'est
téléchargé depuis Internet : ce serait un risque de droit d'auteur).

Idempotent : le contenu est rattaché à un enseignant système dédié ; relancer la
commande ne crée pas de doublons (utiliser --reset pour repartir de zéro).

Usage :
  python manage.py seed_contenu                      # tous niveaux, 3 matières/niveau (IA)
  python manage.py seed_contenu --niveaux Tle,3e --max 6
  python manage.py seed_contenu --no-ai              # gabarits rapides, sans IA
  python manage.py seed_contenu --reset
"""
import json
import re

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from school.models import Matieres, Enseignants, Cours, Epreuves, Questions
from school import ai_service

SYSTEM_EMAIL = 'catalogue@smartschool.cm'

# Ordre de priorité des matières (les plus structurantes d'abord).
PRIORITY = [
    'MATH', 'FRAN', 'ANGL', 'PHY', 'PCT', 'SVT', 'CHI', 'HG', 'PHIL', 'INFO', 'ECO',
    'MATH_EN', 'ENG', 'FRE', 'PHY_EN', 'BIO', 'CHEM', 'CSC', 'HIST', 'GEOG', 'ECON',
]

ALL_NIVEAUX = ['6e', '5e', '4e', '3e', '2nde', '1ere', 'Tle',
               'Form1', 'Form2', 'Form3', 'Form4', 'Form5', 'LowerSixth', 'UpperSixth']


def _extract_json(texte):
    texte = (texte or '').strip()
    if texte.startswith('```'):
        texte = re.sub(r'^```[a-zA-Z]*\n?', '', texte)
        texte = re.sub(r'\n?```$', '', texte).strip()
    a, b = texte.find('{'), texte.rfind('}')
    if a != -1 and b != -1 and b > a:
        texte = texte[a:b + 1]
    return json.loads(texte)


class Command(BaseCommand):
    help = "Génère cours + exercices par niveau/matière (programme camerounais)."

    def add_arguments(self, parser):
        parser.add_argument('--niveaux', default='', help='Liste séparée par des virgules (def: tous).')
        parser.add_argument('--max', type=int, default=3, help='Nb de matières par niveau (0 = toutes).')
        parser.add_argument('--questions', type=int, default=5, help='Nb de QCM par exercice.')
        parser.add_argument('--no-ai', action='store_true', help='Désactive l\'IA (gabarits).')
        parser.add_argument('--reset', action='store_true', help='Supprime le contenu système avant.')

    def handle(self, *args, **opt):
        prof = self._systeme_enseignant()
        use_ai = not opt['no_ai'] and ai_service.is_configured()

        if opt['reset']:
            Questions.objects.filter(id_epreuve__id_enseignant=prof).delete()
            ne, _ = Epreuves.objects.filter(id_enseignant=prof).delete()
            nc, _ = Cours.objects.filter(id_enseignant=prof).delete()
            self.stdout.write(self.style.WARNING(f'Reset : {nc} cours / {ne} épreuves supprimés.'))

        niveaux = [n.strip() for n in opt['niveaux'].split(',') if n.strip()] or ALL_NIVEAUX
        self.stdout.write(f"IA : {'activée' if use_ai else 'désactivée (gabarits)'} — niveaux : {', '.join(niveaux)}")

        prio = {c: i for i, c in enumerate(PRIORITY)}
        total_c = total_e = 0

        for niveau in niveaux:
            mats = [m for m in Matieres.objects.filter(actif=True) if niveau in (m.niveaux or [])]
            mats.sort(key=lambda m: prio.get(m.code, 999))
            if opt['max'] > 0:
                mats = mats[:opt['max']]

            for m in mats:
                if Cours.objects.filter(id_enseignant=prof, id_matiere=m, niveau=niveau).exists():
                    continue  # déjà semé
                paquet = self._generer(m, niveau, opt['questions']) if use_ai else None
                if not paquet:
                    paquet = self._gabarit(m, niveau, opt['questions'])
                try:
                    self._creer(prof, m, niveau, paquet)
                    total_c += 1
                    total_e += 1
                    self.stdout.write(f"  [OK] {niveau} - {m.nom}")
                except Exception as exc:  # pragma: no cover
                    self.stdout.write(self.style.ERROR(f"  [ERR] {niveau} - {m.nom} : {exc!r}"))

        self.stdout.write(self.style.SUCCESS(f"\nTerminé — {total_c} cours, {total_e} exercices créés."))

    # ── Enseignant système ────────────────────────────────────────────────
    def _systeme_enseignant(self):
        prof = Enseignants.objects.filter(email=SYSTEM_EMAIL).first()
        if prof:
            return prof
        prof = Enseignants.objects.create(
            username=SYSTEM_EMAIL, email=SYSTEM_EMAIL, role='enseignant',
            nom='SmartSchool', prenom='Catalogue', specialite='Catalogue officiel',
            verifie=True, email_verifie=True, actif=True,
        )
        prof.set_password('Catalogue1234!')
        prof.save()
        return prof

    # ── Génération IA ─────────────────────────────────────────────────────
    def _generer(self, matiere, niveau, nb_q):
        langue = 'en' if matiere.langue == 'en' else 'fr'
        sys = ("Tu es un professeur du secondaire camerounais (programme MINESEC/GCE). "
               "Tu réponds UNIQUEMENT par du JSON valide, sans texte autour.")
        prompt = (
            f"Matière : {matiere.nom}. Classe : {niveau} (système camerounais). "
            f"Choisis UN chapitre fondamental du programme et rédige :\n"
            f"1) un cours clair et structuré (titre + contenu de 350 à 600 mots, "
            f"avec définitions, propriétés et un exemple), {'en anglais' if langue == 'en' else 'en français'};\n"
            f"2) {nb_q} questions QCM de révision sur ce chapitre, avec la bonne réponse.\n"
            'Réponds au format JSON : {"titre": "...", "contenu": "...", '
            '"questions": [{"enonce": "...", "options": ["..","..","..",".."], "reponse_correcte": ".."}]}'
        )
        try:
            brut = ai_service.chat([{'role': 'user', 'content': prompt}], system=sys,
                                   max_tokens=2200, temperature=0.4, timeout=60)
            data = _extract_json(brut)
        except (ai_service.AIUnavailable, ValueError, json.JSONDecodeError):
            return None

        titre = (data.get('titre') or '').strip()
        contenu = (data.get('contenu') or '').strip()
        if not titre or len(contenu) < 80:
            return None
        questions = []
        for q in (data.get('questions') or []):
            enonce = (q.get('enonce') or '').strip()
            opts = [str(o).strip() for o in (q.get('options') or []) if str(o).strip()]
            correcte = (q.get('reponse_correcte') or '').strip()
            if not enonce or len(opts) < 2:
                continue
            if correcte not in opts:
                correcte = opts[0]
            questions.append({'enonce': enonce, 'options': opts, 'reponse_correcte': correcte})
        if not questions:
            return None
        return {'titre': titre[:200], 'contenu': contenu, 'questions': questions, 'langue': langue}

    # ── Gabarit de secours (sans IA) ──────────────────────────────────────
    def _gabarit(self, matiere, niveau, nb_q):
        langue = 'en' if matiere.langue == 'en' else 'fr'
        titre = f"{matiere.nom} — Introduction ({niveau})"
        contenu = (
            f"# {matiere.nom} ({niveau})\n\n"
            f"Ce cours d'introduction présente les notions de base de {matiere.nom} "
            f"au programme de la classe de {niveau}.\n\n"
            "## Objectifs\n- Comprendre les définitions essentielles.\n"
            "- Maîtriser les méthodes de base.\n- S'entraîner sur des exercices types.\n\n"
            "## Contenu\nRévise régulièrement et entraîne-toi avec l'exercice associé. "
            "Ton enseignant pourra compléter ce cours avec ses propres ressources (PDF inclus)."
        )
        questions = [{
            'enonce': f"Question {i} de révision en {matiere.nom} ({niveau}).",
            'options': ['Réponse A', 'Réponse B', 'Réponse C', 'Réponse D'],
            'reponse_correcte': 'Réponse A',
        } for i in range(1, max(1, nb_q) + 1)]
        return {'titre': titre, 'contenu': contenu, 'questions': questions, 'langue': langue}

    # ── Persistance ───────────────────────────────────────────────────────
    @transaction.atomic
    def _creer(self, prof, matiere, niveau, paquet):
        Cours.objects.create(
            id_enseignant=prof, id_matiere=matiere, titre=paquet['titre'],
            contenu=paquet['contenu'], niveau=niveau, langue=paquet['langue'],
            statut='publie', valide=True, date_publication=timezone.now(),
        )
        epreuve = Epreuves.objects.create(
            id_matiere=matiere, id_enseignant=prof,
            titre=f"Exercice — {matiere.nom} ({niveau})",
            type_epreuve='exercice', niveau=niveau, langue=paquet['langue'],
            source='ENS', nb_questions=len(paquet['questions']), statut='actif',
        )
        Questions.objects.bulk_create([
            Questions(
                id_epreuve=epreuve, numero_ordre=i, enonce=q['enonce'],
                type_question='qcm', options=q['options'],
                reponse_correcte=q['reponse_correcte'], points=1, difficulte='moyen',
            )
            for i, q in enumerate(paquet['questions'], start=1)
        ])
