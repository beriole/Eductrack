"""Sprint 5 — Tableau de bord et espace enseignant."""
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django_filters.rest_framework import DjangoFilterBackend
from school.models import Enseignants, Cours, Epreuves, Questions, SessionsExamen
from school.serializers import CoursSerializer, EpreuveSerializer, QuestionSerializer

MAX_PDF_MO = 25


def _valider_pdf(fichier):
    """Renvoie un message d'erreur si le fichier n'est pas un PDF valide, sinon None."""
    if not fichier:
        return "Aucun fichier fourni (champ 'fichier')."
    if not fichier.name.lower().endswith('.pdf'):
        return "Le fichier doit être un PDF."
    if fichier.size > MAX_PDF_MO * 1024 * 1024:
        return f"Le PDF dépasse {MAX_PDF_MO} Mo."
    return None


class EnseignantDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'enseignant':
            return Response({"error": "Réservé aux enseignants."}, status=status.HTTP_403_FORBIDDEN)
        try:
            enseignant = Enseignants.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Enseignants.DoesNotExist:
            return Response({"error": "Profil enseignant introuvable."}, status=status.HTTP_404_NOT_FOUND)

        cours_qs = Cours.objects.filter(id_enseignant=enseignant)
        epreuves_qs = Epreuves.objects.filter(id_enseignant=enseignant)
        total_vues = sum(c.nb_vues for c in cours_qs)
        total_sessions = SessionsExamen.objects.filter(
            id_epreuve__in=epreuves_qs, statut='termine'
        ).count()

        return Response({
            "stats": {
                "nb_cours": cours_qs.count(),
                "nb_cours_publies": cours_qs.filter(statut='publie').count(),
                "nb_epreuves": epreuves_qs.count(),
                "total_vues": total_vues,
                "total_sessions_etudiants": total_sessions,
                "taux_remuneration": float(enseignant.taux_remuneration),
                "total_gains": float(enseignant.total_gains),
            },
            "top_cours": CoursSerializer(cours_qs.order_by('-nb_vues')[:5], many=True).data,
            "epreuves_recentes": EpreuveSerializer(epreuves_qs.order_by('-date_ajout')[:5], many=True).data,
        })


class EnseignantCoursListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'enseignant':
            return Response({"error": "Réservé aux enseignants."}, status=status.HTTP_403_FORBIDDEN)
        try:
            enseignant = Enseignants.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Enseignants.DoesNotExist:
            return Response({"error": "Profil enseignant introuvable."}, status=status.HTTP_404_NOT_FOUND)

        cours = Cours.objects.filter(id_enseignant=enseignant).order_by('-date_creation')
        return Response(CoursSerializer(cours, many=True).data)


# ─── Banque de sujets d'examen de l'enseignant ───────────────────────────────

class EnseignantEpreuvesListView(generics.ListAPIView):
    """GET /enseignant/epreuves/ — les épreuves créées/importées par l'enseignant."""
    serializer_class = EpreuveSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['type_epreuve', 'niveau', 'serie', 'annee', 'id_matiere']

    def get_queryset(self):
        if self.request.user.role != 'enseignant':
            return Epreuves.objects.none()
        ens = Enseignants.objects.filter(id_utilisateur=self.request.user.id_utilisateur).first()
        if not ens:
            return Epreuves.objects.none()
        return Epreuves.objects.filter(id_enseignant=ens).order_by('-date_ajout')

    def get_serializer_context(self):
        # Le propriétaire voit l'état de ses corrigés (texte + PDF).
        ctx = super().get_serializer_context()
        ctx['reveler_corrige'] = True
        return ctx


class EnseignantEpreuveDetailView(APIView):
    """GET/PATCH/DELETE /enseignant/epreuves/<id>/ — gestion d'une épreuve (propriétaire).

    GET renvoie l'épreuve + ses questions (avec réponses, vue enseignant).
    PATCH met à jour les métadonnées et le corrigé. DELETE si aucune session."""
    permission_classes = [IsAuthenticated]
    CHAMPS_MODIFIABLES = {'titre', 'type_epreuve', 'niveau', 'serie', 'annee',
                          'source', 'duree_minutes', 'langue', 'corrige', 'statut'}

    def _epreuve(self, request, id_epreuve):
        if request.user.role != 'enseignant':
            return None
        ens = Enseignants.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not ens:
            return None
        return Epreuves.objects.filter(id_epreuve=id_epreuve, id_enseignant=ens).first()

    def get(self, request, id_epreuve):
        epreuve = self._epreuve(request, id_epreuve)
        if not epreuve:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)
        questions = Questions.objects.filter(id_epreuve=epreuve).order_by('numero_ordre')
        data = EpreuveSerializer(epreuve, context={'request': request, 'reveler_corrige': True}).data
        data['questions'] = QuestionSerializer(questions, many=True).data
        return Response(data, status=status.HTTP_200_OK)

    def patch(self, request, id_epreuve):
        epreuve = self._epreuve(request, id_epreuve)
        if not epreuve:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)
        maj = {k: v for k, v in request.data.items() if k in self.CHAMPS_MODIFIABLES}
        serializer = EpreuveSerializer(epreuve, data=maj, partial=True,
                                       context={'request': request, 'reveler_corrige': True})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, id_epreuve):
        epreuve = self._epreuve(request, id_epreuve)
        if not epreuve:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)
        if SessionsExamen.objects.filter(id_epreuve=epreuve).exists():
            return Response(
                {"error": "Impossible de supprimer : des élèves ont déjà passé cette épreuve."},
                status=status.HTTP_400_BAD_REQUEST)
        epreuve.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Exercices : création/édition avec corrections détaillées ────────────────

TYPES_QUESTION = {'qcm', 'vrai_faux', 'reponse_courte', 'redaction'}


def _valider_questions(payload):
    """Valide/normalise une liste de questions. Renvoie (questions_propres, erreurs)."""
    propres, erreurs = [], []
    if not isinstance(payload, list) or not payload:
        return propres, ["Au moins une question est requise."]
    for i, q in enumerate(payload, start=1):
        if not isinstance(q, dict):
            erreurs.append(f"Question {i} invalide."); continue
        enonce = (q.get('enonce') or '').strip()
        type_q = q.get('type_question') if q.get('type_question') in TYPES_QUESTION else 'qcm'
        options = [str(o).strip() for o in (q.get('options') or []) if str(o).strip()]
        correcte = (q.get('reponse_correcte') or '').strip()
        if not enonce:
            erreurs.append(f"Question {i} : énoncé requis."); continue
        if type_q in ('qcm', 'vrai_faux'):
            if len(options) < 2:
                erreurs.append(f"Question {i} : au moins 2 options."); continue
            if correcte not in options:
                erreurs.append(f"Question {i} : la bonne réponse doit figurer dans les options."); continue
        try:
            points = float(q.get('points', 1) or 1)
        except (TypeError, ValueError):
            points = 1.0
        propres.append({
            'enonce': enonce, 'type_question': type_q,
            'options': options if type_q in ('qcm', 'vrai_faux') else [],
            'reponse_correcte': correcte or None,
            'explication': (q.get('explication') or '').strip() or None,
            'points': max(0.5, min(20.0, points)),
            'difficulte': q.get('difficulte') if q.get('difficulte') in ('facile', 'moyen', 'difficile') else 'moyen',
        })
    return propres, erreurs


def _creer_questions(epreuve, questions):
    from django.db import transaction
    with transaction.atomic():
        Questions.objects.filter(id_epreuve=epreuve).delete()
        Questions.objects.bulk_create([
            Questions(
                id_epreuve=epreuve, numero_ordre=i, enonce=q['enonce'],
                type_question=q['type_question'], options=q['options'],
                reponse_correcte=q['reponse_correcte'], explication=q['explication'],
                points=q['points'], difficulte=q['difficulte'],
            )
            for i, q in enumerate(questions, start=1)
        ])
        epreuve.nb_questions = len(questions)
        epreuve.save(update_fields=['nb_questions'])


class EnseignantExerciceCreateView(APIView):
    """POST /enseignant/exercices/ — crée un exercice (épreuve) avec ses questions."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'enseignant':
            return Response({"error": "Réservé aux enseignants."}, status=status.HTTP_403_FORBIDDEN)
        ens = Enseignants.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not ens:
            return Response({"error": "Profil enseignant introuvable."}, status=status.HTTP_404_NOT_FOUND)

        from school.models import Matieres
        titre = (request.data.get('titre') or '').strip()
        matiere = Matieres.objects.filter(id_matiere=request.data.get('id_matiere')).first()
        niveau = (request.data.get('niveau') or '').strip()
        if not titre or not matiere or not niveau:
            return Response({"error": "titre, id_matiere et niveau sont requis."},
                            status=status.HTTP_400_BAD_REQUEST)

        questions, erreurs = _valider_questions(request.data.get('questions'))
        if erreurs:
            return Response({"error": "Questions invalides.", "details": erreurs},
                            status=status.HTTP_400_BAD_REQUEST)

        epreuve = Epreuves.objects.create(
            id_matiere=matiere, id_enseignant=ens, titre=titre[:200],
            type_epreuve='exercice', niveau=niveau,
            serie=(request.data.get('serie') or '').strip() or None,
            langue=matiere.langue if matiere.langue in ('fr', 'en') else 'fr',
            duree_minutes=max(5, len(questions) * 3), statut='actif')
        _creer_questions(epreuve, questions)

        data = EpreuveSerializer(epreuve).data
        data['questions'] = QuestionSerializer(Questions.objects.filter(id_epreuve=epreuve).order_by('numero_ordre'), many=True).data
        return Response(data, status=status.HTTP_201_CREATED)


class EnseignantExerciceQuestionsView(APIView):
    """PUT /enseignant/exercices/<id>/questions/ — remplace les questions (propriétaire)."""
    permission_classes = [IsAuthenticated]

    def put(self, request, id_epreuve):
        if request.user.role != 'enseignant':
            return Response({"error": "Réservé aux enseignants."}, status=status.HTTP_403_FORBIDDEN)
        ens = Enseignants.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        epreuve = Epreuves.objects.filter(id_epreuve=id_epreuve, id_enseignant=ens).first() if ens else None
        if not epreuve:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)
        if SessionsExamen.objects.filter(id_epreuve=epreuve).exists():
            return Response({"error": "Des élèves ont déjà passé cet exercice : questions non modifiables."},
                            status=status.HTTP_400_BAD_REQUEST)

        questions, erreurs = _valider_questions(request.data.get('questions'))
        if erreurs:
            return Response({"error": "Questions invalides.", "details": erreurs},
                            status=status.HTTP_400_BAD_REQUEST)
        _creer_questions(epreuve, questions)
        data = EpreuveSerializer(epreuve).data
        data['questions'] = QuestionSerializer(Questions.objects.filter(id_epreuve=epreuve).order_by('numero_ordre'), many=True).data
        return Response(data, status=status.HTTP_200_OK)


# ─── Téléversement de PDF (cours / épreuves) ─────────────────────────────────

class CoursPdfUploadView(APIView):
    """POST /enseignant/cours/<id>/pdf/ — attache un PDF à un cours (propriétaire)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, id_cours):
        cours = Cours.objects.filter(id_cours=id_cours).first()
        if not cours or str(cours.id_enseignant.id_utilisateur) != str(request.user.id_utilisateur):
            return Response({"error": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)
        err = _valider_pdf(request.FILES.get('fichier'))
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        cours.fichier_pdf = request.FILES['fichier']
        cours.save(update_fields=['fichier_pdf'])
        return Response(CoursSerializer(cours, context={'request': request}).data, status=status.HTTP_200_OK)


class EpreuvePdfUploadView(APIView):
    """POST /enseignant/epreuves/<id>/pdf/ — attache un PDF (sujet/annale/exercice) à une épreuve."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, id_epreuve):
        ens = Enseignants.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        epreuve = Epreuves.objects.filter(id_epreuve=id_epreuve, id_enseignant=ens).first() if ens else None
        if not epreuve:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)
        err = _valider_pdf(request.FILES.get('fichier'))
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        # cible = 'sujet' (défaut) ou 'corrige' : un sujet/annale ET son corrigé en PDF.
        cible = (request.data.get('cible') or 'sujet').lower()
        if cible not in ('sujet', 'corrige'):
            return Response({"error": "cible invalide (sujet|corrige)."}, status=status.HTTP_400_BAD_REQUEST)
        champ = 'corrige_pdf' if cible == 'corrige' else 'fichier_pdf'
        setattr(epreuve, champ, request.FILES['fichier'])
        epreuve.save(update_fields=[champ])
        return Response(EpreuveSerializer(epreuve, context={'request': request, 'reveler_corrige': True}).data,
                        status=status.HTTP_200_OK)
