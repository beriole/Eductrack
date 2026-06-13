import logging
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from school.models import Eleves, Epreuves, SessionsExamen, Questions, Reponses
from school.serializers import (
    SessionExamenSerializer,
    SessionResultatSerializer,
    ReponseSubmitSerializer,
)
from school.api_views.gamification_views import evaluer_badges


class SessionDemarrerView(APIView):
    """Démarre une nouvelle session de passation pour une épreuve donnée."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id_epreuve):
        if request.user.role != 'eleve':
            return Response({"error": "Seuls les élèves peuvent passer des épreuves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            epreuve = Epreuves.objects.get(id_epreuve=id_epreuve, statut='actif')
        except Epreuves.DoesNotExist:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Vérifier qu'il n'y a pas une session en cours pour cette épreuve
        session_en_cours = SessionsExamen.objects.filter(
            id_eleve=eleve, id_epreuve=epreuve, statut='en_cours'
        ).first()
        if session_en_cours:
            return Response(
                {"message": "Session déjà en cours.", "session": SessionExamenSerializer(session_en_cours).data},
                status=status.HTTP_200_OK,
            )

        mode = request.data.get('mode', 'exercice')
        nb_questions = Questions.objects.filter(id_epreuve=epreuve).count()

        session = SessionsExamen.objects.create(
            id_eleve=eleve,
            id_epreuve=epreuve,
            mode=mode,
            nb_questions=nb_questions,
        )
        return Response(SessionExamenSerializer(session).data, status=status.HTTP_201_CREATED)


class SessionReponsesView(APIView):
    """Soumet les réponses d'une session (peut être appelé plusieurs fois — upsert)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id_session):
        try:
            session = SessionsExamen.objects.get(
                id_session=id_session,
                id_eleve__id_utilisateur=request.user.id_utilisateur,
            )
        except SessionsExamen.DoesNotExist:
            return Response({"error": "Session introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if session.statut != 'en_cours':
            return Response({"error": "Cette session est déjà terminée."}, status=status.HTTP_400_BAD_REQUEST)

        reponses_data = request.data.get('reponses', [])
        serializer = ReponseSubmitSerializer(data=reponses_data, many=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        nb_saved = 0
        for rep_data in serializer.validated_data:
            try:
                question = Questions.objects.get(id_question=rep_data['id_question'], id_epreuve=session.id_epreuve)
            except Questions.DoesNotExist:
                continue

            # Correction automatique : QCM, Vrai/Faux et réponse courte.
            # La rédaction reste à correction manuelle (est_correcte = None).
            est_correcte = None
            points = None
            if question.type_question in ('qcm', 'vrai_faux', 'reponse_courte') and question.reponse_correcte:
                donnee = (rep_data['contenu_reponse'] or '').strip().casefold()
                attendue = question.reponse_correcte.strip().casefold()
                est_correcte = donnee == attendue
                points = float(question.points) if est_correcte else 0.0

            Reponses.objects.update_or_create(
                id_session=session,
                id_question=question,
                defaults={
                    'contenu_reponse': rep_data['contenu_reponse'],
                    'est_correcte': est_correcte,
                    'points_obtenus': points,
                    'temps_reponse_sec': rep_data.get('temps_reponse_sec'),
                },
            )
            nb_saved += 1

        return Response({"message": f"{nb_saved} réponse(s) enregistrée(s)."}, status=status.HTTP_200_OK)


class SessionTerminerView(APIView):
    """Termine une session, calcule le score, attribue les XP et évalue les badges."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id_session):
        try:
            session = SessionsExamen.objects.get(
                id_session=id_session,
                id_eleve__id_utilisateur=request.user.id_utilisateur,
            )
        except SessionsExamen.DoesNotExist:
            return Response({"error": "Session introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if session.statut != 'en_cours':
            return Response({"error": "Cette session est déjà terminée."}, status=status.HTTP_400_BAD_REQUEST)

        duree_sec = request.data.get('duree_reelle_sec')

        reponses = session.reponses.all()
        nb_bonnes = reponses.filter(est_correcte=True).count()
        nb_total = session.nb_questions or 1
        note = round((nb_bonnes / nb_total) * 20, 2)

        session.statut = 'termine'
        session.date_fin = timezone.now()
        session.nb_bonnes_reponses = nb_bonnes
        session.note_obtenue = note
        if duree_sec:
            session.duree_reelle_sec = int(duree_sec)
        session.save()

        # Mise à jour score_global et XP de l'élève
        eleve = session.id_eleve
        xp_gagnes = nb_bonnes * 10
        eleve.points_gamification += xp_gagnes

        # Mise à jour du score_global (moyenne glissante simple)
        pourcentage = round((nb_bonnes / nb_total) * 100)
        eleve.score_global = round((eleve.score_global + pourcentage) / 2)

        # Mise à jour du streak
        today = timezone.now().date()
        if eleve.date_diagnostic and (today - eleve.date_diagnostic).days == 1:
            eleve.streak_jours += 1
        elif not eleve.date_diagnostic or (today - eleve.date_diagnostic).days > 1:
            eleve.streak_jours = 1
        eleve.date_diagnostic = today

        eleve.save(update_fields=['points_gamification', 'score_global', 'streak_jours', 'date_diagnostic'])

        nouveaux_badges = evaluer_badges(eleve)

        # Détection de lacunes transversale (Module 9) : recalcule la maîtrise
        # de l'élève sur l'ensemble de ses résultats. Best-effort, ne doit pas
        # faire échouer la clôture de session.
        recap_lacunes = None
        try:
            from school.lacune_engine import detecter_lacunes_transversales
            recap_lacunes = detecter_lacunes_transversales(eleve)
        except Exception:
            logging.getLogger(__name__).exception("Détection de lacunes échouée")

        return Response({
            "note": note,
            "nb_bonnes_reponses": nb_bonnes,
            "nb_questions": nb_total,
            "xp_gagnes": xp_gagnes,
            "streak": eleve.streak_jours,
            "nouveaux_badges": nouveaux_badges,
            "lacunes": recap_lacunes,
            "session": SessionResultatSerializer(session).data,
        }, status=status.HTTP_200_OK)


class SessionCorrectionView(APIView):
    """Correction détaillée d'une session TERMINÉE : pour chaque question,
    l'énoncé, la réponse de l'élève, la bonne réponse, l'explication et le
    statut. Fournit aussi une analyse des erreurs (par difficulté) et la liste
    des notions à revoir. La correction n'est jamais accessible avant la fin."""
    permission_classes = [IsAuthenticated]

    def get(self, request, id_session):
        try:
            session = SessionsExamen.objects.select_related('id_epreuve').get(
                id_session=id_session,
                id_eleve__id_utilisateur=request.user.id_utilisateur,
            )
        except SessionsExamen.DoesNotExist:
            return Response({"error": "Session introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if session.statut == 'en_cours':
            return Response(
                {"error": "La correction n'est disponible qu'après avoir terminé l'examen."},
                status=status.HTTP_403_FORBIDDEN,
            )

        questions = Questions.objects.filter(id_epreuve=session.id_epreuve).order_by('numero_ordre')
        reponses = {r.id_question_id: r for r in session.reponses.all()}

        items = []
        # Analyse des erreurs par niveau de difficulté.
        par_difficulte = {}
        notions_a_revoir = []

        for q in questions:
            rep = reponses.get(q.id_question)
            contenu = rep.contenu_reponse if rep else None
            est_correcte = rep.est_correcte if rep else False
            repondu = rep is not None and contenu not in (None, '')

            stat = par_difficulte.setdefault(q.difficulte, {'bonnes': 0, 'total': 0})
            stat['total'] += 1
            if est_correcte:
                stat['bonnes'] += 1
            elif len(notions_a_revoir) < 8:
                # Notion à revoir = énoncé (tronqué) des questions ratées.
                extrait = (q.enonce or '').strip().replace('\n', ' ')
                if len(extrait) > 90:
                    extrait = extrait[:90].rstrip() + '…'
                notions_a_revoir.append(extrait)

            items.append({
                'id_question': str(q.id_question),
                'numero_ordre': q.numero_ordre,
                'enonce': q.enonce,
                'type_question': q.type_question,
                'options': q.options,
                'points': float(q.points),
                'difficulte': q.difficulte,
                'image_url': q.image_url,
                'reponse_eleve': contenu,
                'reponse_correcte': q.reponse_correcte,
                'explication': q.explication,
                'est_correcte': bool(est_correcte),
                'repondu': repondu,
            })

        nb_total = session.nb_questions or len(items) or 1
        nb_bonnes = session.nb_bonnes_reponses or 0

        # Corrigé de l'enseignant — révélé uniquement ici (après composition).
        corrige_pdf = None
        if session.id_epreuve.corrige_pdf:
            corrige_pdf = request.build_absolute_uri(session.id_epreuve.corrige_pdf.url)

        return Response({
            'id_session': str(session.id_session),
            'epreuve_titre': session.id_epreuve.titre,
            'corrige': session.id_epreuve.corrige,
            'corrige_pdf': corrige_pdf,
            'mode': session.mode,
            'note_obtenue': float(session.note_obtenue) if session.note_obtenue is not None else 0.0,
            'nb_questions': nb_total,
            'nb_bonnes_reponses': nb_bonnes,
            'nb_sans_reponse': sum(1 for it in items if not it['repondu']),
            'duree_reelle_sec': session.duree_reelle_sec,
            'par_difficulte': par_difficulte,
            'notions_a_revoir': notions_a_revoir,
            'questions': items,
        }, status=status.HTTP_200_OK)


class SessionHistoriqueView(generics.ListAPIView):
    """Historique des sessions d'examen de l'élève connecté."""
    serializer_class = SessionExamenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return SessionsExamen.objects.none()
        return SessionsExamen.objects.filter(
            id_eleve__id_utilisateur=self.request.user.id_utilisateur
        ).order_by('-date_debut')


class SessionDetailView(generics.RetrieveAPIView):
    """Détail complet d'une session avec toutes les réponses."""
    serializer_class = SessionResultatSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'id_session'

    def get_queryset(self):
        return SessionsExamen.objects.filter(
            id_eleve__id_utilisateur=self.request.user.id_utilisateur
        )
