from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from school.models import Eleves, SessionsFocus, Matieres
from school.serializers import SessionFocusSerializer


class FocusStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil introuvable."}, status=status.HTTP_404_NOT_FOUND)

        duree = int(request.data.get('duree_pomodoro_min', 25))
        duree = max(10, min(60, duree))
        matiere_id = request.data.get('id_matiere')

        matiere = None
        if matiere_id:
            matiere = Matieres.objects.filter(id_matiere=matiere_id).first()

        focus = SessionsFocus.objects.create(
            id_eleve=eleve,
            duree_pomodoro_min=duree,
            id_matiere=matiere,
        )
        return Response(SessionFocusSerializer(focus).data, status=status.HTTP_201_CREATED)


class FocusStopView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id_focus):
        try:
            focus = SessionsFocus.objects.get(
                id_focus=id_focus,
                id_eleve__id_utilisateur=request.user.id_utilisateur,
                date_fin__isnull=True,
            )
        except SessionsFocus.DoesNotExist:
            return Response(
                {"error": "Session focus introuvable ou déjà terminée."},
                status=status.HTTP_404_NOT_FOUND,
            )

        nb_sessions_completees = max(1, int(request.data.get('nb_sessions', 1)))
        now = timezone.now()
        duree_totale = int((now - focus.date_debut).total_seconds() / 60)

        focus.date_fin = now
        focus.nb_sessions = nb_sessions_completees
        focus.temps_total_min = duree_totale
        focus.save(update_fields=['date_fin', 'nb_sessions', 'temps_total_min'])

        # Bonus XP : 5 pts par pomodoro complété
        eleve = focus.id_eleve
        xp_bonus = nb_sessions_completees * 5
        eleve.points_gamification += xp_bonus
        eleve.save(update_fields=['points_gamification'])

        data = SessionFocusSerializer(focus).data
        data['xp_gagne'] = xp_bonus
        return Response(data, status=status.HTTP_200_OK)


class FocusListView(generics.ListAPIView):
    serializer_class = SessionFocusSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return SessionsFocus.objects.none()
        return SessionsFocus.objects.filter(
            id_eleve__id_utilisateur=self.request.user.id_utilisateur
        ).order_by('-date_debut')
