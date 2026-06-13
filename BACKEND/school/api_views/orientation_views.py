"""Module d'orientation scolaire (système éducatif camerounais).

Deux flux :
- Legacy `/creer/` : auto-évaluation rapide (conservé pour compatibilité).
- **Test intensif `/test/` + `/soumettre/`** : ~100 questions réparties sur les
  matières, notées automatiquement ; l'orientation découle des résultats réels
  par matière croisés avec les lacunes ([[orientation_engine]])."""
import json
import logging
import random

from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from school.models import Eleves, Orientations, Matieres, Questions, Epreuves, Lacunes
from school.serializers import OrientationSerializer
from school import ai_service, orientation_engine

logger = logging.getLogger(__name__)

CIBLE_QUESTIONS = 100

SERIES_CONFIG = {
    'C': {
        'label': 'Série C — Mathématiques et Physique-Chimie',
        'criteres': {'MATH': 70, 'PHY': 65},
        'aptitudes': ['Raisonnement logique', 'Calcul avancé', 'Physique expérimentale'],
        'metiers': ['Ingénieur Civil', 'Médecin', 'Architecte', 'Pilote de ligne', 'Informaticien'],
        'filieres': ['Polytechnique (UY1)', 'ENSP Yaoundé', 'Faculté des Sciences (FS)', 'Médecine (FMSB)', 'ENSET Douala'],
    },
    'D': {
        'label': 'Série D — Mathématiques et Sciences de la Vie et de la Terre',
        'criteres': {'MATH': 60, 'SVT': 65},
        'aptitudes': ['Biologie cellulaire', 'Chimie organique', 'Observation scientifique'],
        'metiers': ['Médecin', 'Pharmacien', 'Biologiste', 'Agronome', 'Vétérinaire'],
        'filieres': ['Médecine (FMSB UY1)', 'Pharmacie', 'FASA Dschang', 'Biochimie FMSB', 'IUT Ngaoundéré'],
    },
    'A1': {
        'label': 'Série A1 — Lettres et Sciences Humaines (Philosophie)',
        'criteres': {'FRAN': 70},
        'aptitudes': ['Expression écrite', 'Analyse littéraire', 'Philosophie', 'Langues'],
        'metiers': ['Journaliste', 'Avocat', 'Professeur de Lettres', 'Écrivain', 'Diplomate'],
        'filieres': ['FALSH (UY1)', 'Sciences Politiques (FSJP)', 'ENS Yaoundé I', 'ESSTIC', 'IRIC'],
    },
    'A4': {
        'label': 'Série A4 — Sciences Humaines et Sociales',
        'criteres': {'FRAN': 60, 'HIS': 60},
        'aptitudes': ['Sciences sociales', 'Histoire-Géographie', 'Analyse économique'],
        'metiers': ['Historien', 'Sociologue', 'Économiste', 'Enseignant', 'Gestionnaire RH'],
        'filieres': ['FALSH (UY1)', 'FSEG (UY2)', 'Droit (FSJP)', 'ENS Maroua', 'IRIC'],
    },
    'E': {
        'label': 'Série E — Mathématiques et Techniques Industrielles',
        'criteres': {'MATH': 65},
        'aptitudes': ['Mathématiques appliquées', 'Électronique', 'Mécanique industrielle'],
        'metiers': ['Technicien Industriel', 'Électricien', 'Géomètre', 'Technicien BTP'],
        'filieres': ['IUT (UY1)', 'BTS Technique', 'ENSET Douala', 'Instituts Techniques'],
    },
    'G': {
        'label': 'Série G — Sciences Commerciales et de Gestion',
        'criteres': {},
        'aptitudes': ['Commerce', 'Gestion financière', 'Communication commerciale'],
        'metiers': ['Comptable', 'Gestionnaire', 'Commercial', 'Banquier', 'Entrepreneur'],
        'filieres': ['ESSEC Douala', 'FSEG (UY2)', 'BTS Commerce', 'IUT GEA', 'ISTDI'],
    },
}


def _recommander_serie(scores: dict) -> tuple:
    """Retourne (serie_code, aptitudes, metiers, filieres) selon les scores par matière.

    Parmi les séries dont tous les critères sont satisfaits, choisit celle
    où la somme des scores requis est la plus haute (profil le plus fort).
    Fallback : Série G si aucun critère n'est atteint.
    """
    candidats = []
    for serie, config in SERIES_CONFIG.items():
        criteres = config['criteres']
        if not criteres:
            continue
        if all(scores.get(code, 0) >= seuil for code, seuil in criteres.items()):
            total = sum(scores.get(code, 0) for code in criteres)
            candidats.append((serie, total, config))

    if candidats:
        candidats.sort(key=lambda x: -x[1])
        best_serie, _, best_config = candidats[0]
    else:
        best_serie = 'G'
        best_config = SERIES_CONFIG['G']

    return best_serie, best_config['aptitudes'], best_config['metiers'], best_config['filieres']


class OrientationCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response(
                {"error": "Seuls les élèves peuvent effectuer un test d'orientation."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        scores = request.data.get('scores_matieres', {})
        if not scores:
            return Response({"error": "scores_matieres est requis."}, status=status.HTTP_400_BAD_REQUEST)

        score_global = round(sum(float(v) for v in scores.values()) / len(scores), 2)
        serie, aptitudes, metiers, filieres = _recommander_serie(
            {k: float(v) for k, v in scores.items()}
        )

        orientation = Orientations.objects.create(
            id_eleve=eleve,
            aptitudes_detectees=aptitudes,
            serie_recommandee=serie,
            metiers_recommandes=metiers,
            filieres_superieures=filieres,
            score_global_test=score_global,
            reponses_test=scores,
        )

        return Response({
            "orientation": OrientationSerializer(orientation).data,
            "serie_label": SERIES_CONFIG[serie]['label'],
        }, status=status.HTTP_201_CREATED)


class OrientationListView(generics.ListAPIView):
    serializer_class = OrientationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return Orientations.objects.none()
        return Orientations.objects.filter(
            id_eleve__id_utilisateur=self.request.user.id_utilisateur
        ).order_by('-date_test')


# ─── Test intensif d'orientation ─────────────────────────────────────────────

def _generer_questions_ia(eleve, matiere, n):
    """Génère et persiste n questions IA pour une matière (pour compléter le test)."""
    from school.api_views import exercice_views as ex
    langue = matiere.langue if matiere.langue in ('fr', 'en') else 'fr'
    prompt = ex._construire_prompt(matiere.nom, eleve.niveau_scolaire, eleve.serie,
                                   None, None, 'moyen', n, langue)
    try:
        brut = ai_service.chat([{"role": "user", "content": prompt}],
                               system=ex.SYSTEM_PROMPT, max_tokens=2000, temperature=0.7)
        questions = ex._valider_questions(ex._extraire_json(brut), n)
    except ai_service.AIUnavailable:
        return []
    except (ValueError, json.JSONDecodeError):
        logger.warning("Orientation IA : JSON illisible pour %s.", matiere.code)
        return []
    if not questions:
        return []

    epreuve = Epreuves.objects.create(
        id_matiere=matiere, titre=f"Test orientation — {matiere.nom}",
        type_epreuve='simulation', niveau=eleve.niveau_scolaire, serie=eleve.serie or None,
        source='custom', langue=langue, nb_questions=len(questions), statut='actif')
    Questions.objects.bulk_create([
        Questions(id_epreuve=epreuve, numero_ordre=i, enonce=q['enonce'], type_question='qcm',
                  options=q['options'], reponse_correcte=q['reponse_correcte'], points=1.0,
                  explication=q.get('explication'), difficulte=q['difficulte'])
        for i, q in enumerate(questions, start=1)
    ])
    return list(Questions.objects.filter(id_epreuve=epreuve))


def _assembler_test(eleve):
    """Réunit ~CIBLE_QUESTIONS questions réparties sur les matières (banque + IA).

    Renvoie une liste de (question, matiere). Banque d'abord ; complétée par l'IA
    si configurée pour atteindre le quota par matière."""
    matieres = list(Matieres.objects.filter(actif=True))
    if not matieres:
        return []
    quota = max(1, round(CIBLE_QUESTIONS / len(matieres)))
    selection = []
    for matiere in matieres:
        bank = list(
            Questions.objects.filter(
                id_epreuve__id_matiere=matiere,
                id_epreuve__statut='actif',
                type_question__in=('qcm', 'vrai_faux'),
            ).exclude(reponse_correcte__isnull=True).exclude(reponse_correcte='')
        )
        random.shuffle(bank)
        prises = bank[:quota]
        manque = quota - len(prises)
        if manque > 0 and ai_service.is_configured():
            prises += _generer_questions_ia(eleve, matiere, manque)
        selection += [(q, matiere) for q in prises]
    random.shuffle(selection)
    return selection


class OrientationTestView(APIView):
    """GET /analytique/orientations/test/ — assemble le test intensif d'orientation.

    Renvoie les questions réparties sur les matières (sans la réponse correcte)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        paires = _assembler_test(eleve)
        if not paires:
            return Response(
                {"error": "Aucune question disponible pour constituer le test."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        questions = [{
            "id_question": str(q.id_question),
            "matiere_code": m.code,
            "matiere_nom": m.nom,
            "enonce": q.enonce,
            "type_question": q.type_question,
            "options": q.options,
        } for q, m in paires]

        return Response({
            "nb_questions": len(questions),
            "questions": questions,
        }, status=status.HTTP_200_OK)


class OrientationSoumettreView(APIView):
    """POST /analytique/orientations/soumettre/ — note le test et oriente l'élève.

    Corps : `reponses` = [{id_question, contenu_reponse}]. Calcule un score par
    matière, le croise avec les lacunes et recommande la meilleure série."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        reponses = request.data.get('reponses', [])
        if not isinstance(reponses, list) or not reponses:
            return Response({"error": "reponses est requis."}, status=status.HTTP_400_BAD_REQUEST)

        ids = [r.get('id_question') for r in reponses if r.get('id_question')]
        questions = {
            str(q.id_question): q
            for q in Questions.objects.filter(id_question__in=ids)
            .select_related('id_epreuve__id_matiere')
        }

        # Score par matière (total / correct).
        par_matiere = {}
        for r in reponses:
            q = questions.get(str(r.get('id_question')))
            if not q:
                continue
            code = q.id_epreuve.id_matiere.code
            bucket = par_matiere.setdefault(code, [0, 0])
            bucket[0] += 1
            donnee = (r.get('contenu_reponse') or '').strip().casefold()
            if q.reponse_correcte and donnee == q.reponse_correcte.strip().casefold():
                bucket[1] += 1

        scores = {c: round(corr / tot * 100, 2) for c, (tot, corr) in par_matiere.items() if tot}
        if not scores:
            return Response({"error": "Aucune réponse exploitable."}, status=status.HTTP_400_BAD_REQUEST)

        lacunes_codes = set(
            Lacunes.objects.filter(id_eleve=eleve, statut__in=('detectee', 'en_cours'))
            .values_list('id_matiere__code', flat=True)
        )

        resultat = orientation_engine.analyser_orientation(scores, lacunes_codes)
        nb_questions = sum(tot for tot, _ in par_matiere.values())

        orientation = Orientations.objects.create(
            id_eleve=eleve,
            aptitudes_detectees=resultat['aptitudes_detectees'],
            serie_recommandee=resultat['serie_recommandee'],
            metiers_recommandes=resultat['metiers_recommandes'],
            filieres_superieures=resultat['filieres_superieures'],
            score_global_test=resultat['score_global'],
            reponses_test={'scores_par_matiere': scores, 'nb_questions': nb_questions},
        )

        return Response({
            "orientation": OrientationSerializer(orientation).data,
            "serie_label": resultat['serie_label'],
            "scores_par_matiere": scores,
            "classement": resultat['classement'],
            "nb_questions": nb_questions,
        }, status=status.HTTP_201_CREATED)
