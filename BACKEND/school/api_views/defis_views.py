"""Endpoints de gamification avancée — ligues et défis (Module 12)."""
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from school.models import Eleves
from school import gamification_engine as ge


def _eleve(request):
    return Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()


class LigueView(APIView):
    """GET /gamification/ligue/ — ligue actuelle de l'élève + progression."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = _eleve(request)
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ge.info_ligue(eleve.points_gamification), status=status.HTTP_200_OK)


class DefisListView(APIView):
    """GET /gamification/defis/ — défis actifs avec progression réelle de l'élève."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = _eleve(request)
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)
        defis = ge.synchroniser_defis(eleve)
        return Response({"defis": defis}, status=status.HTTP_200_OK)


class DefiReclamerView(APIView):
    """POST /gamification/defis/<code>/reclamer/ — récupère la récompense XP."""
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = _eleve(request)
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)
        try:
            xp_gagne, xp_total, nouveaux_badges = ge.reclamer_recompense(eleve, code)
        except ge.DefiError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "message": "Récompense récupérée !",
            "xp_gagne": xp_gagne,
            "xp_total": xp_total,
            "nouveaux_badges": nouveaux_badges,
        }, status=status.HTTP_200_OK)
