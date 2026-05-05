from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from school.models import Eleves, Badges, EleveBadges
from school.serializers import BadgeSerializer, EleveBadgeSerializer, EleveSerializer

def evaluer_badges(eleve):
    """
    Fonction utilitaire pour attribuer automatiquement des badges
    en fonction des points XP ou du streak.
    """
    badges = Badges.objects.filter(actif=True)
    nouveaux_badges = []
    
    for badge in badges:
        # Vérifier si l'élève a déjà ce badge
        if EleveBadges.objects.filter(id_eleve=eleve, id_badge=badge).exists():
            continue
            
        critere = badge.critere_json
        attribuer = False
        
        # Logique très basique : ex { "type": "xp", "seuil": 100 } ou { "type": "streak", "seuil": 5 }
        c_type = critere.get("type")
        c_seuil = critere.get("seuil", 0)
        
        if c_type == "xp" and eleve.points_gamification >= c_seuil:
            attribuer = True
        elif c_type == "streak" and eleve.streak_jours >= c_seuil:
            attribuer = True
            
        if attribuer:
            EleveBadges.objects.create(id_eleve=eleve, id_badge=badge, contexte="Attribution automatique")
            nouveaux_badges.append(badge.nom)
            
    return nouveaux_badges

class XPView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Seuls les élèves peuvent gagner de l'XP."}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get("action", "general")
        points_gagnes = request.data.get("points", 10) # default 10 points
        
        # Gestion du Streak
        now = timezone.now()
        dernier_diagnostic = eleve.date_diagnostic # on utilise un champ existant temporairement ou la date de dernière connexion
        # Si on considère date_diagnostic comme la date de dernière activité XP pour le streak :
        if not eleve.date_diagnostic or eleve.date_diagnostic < now.date():
            # Nouveau jour
            if eleve.date_diagnostic and (now.date() - eleve.date_diagnostic).days == 1:
                eleve.streak_jours += 1
            else:
                eleve.streak_jours = 1 # Reset ou début
            eleve.date_diagnostic = now.date()

        eleve.points_gamification += int(points_gagnes)
        eleve.save(update_fields=['points_gamification', 'streak_jours', 'date_diagnostic'])

        # Évaluation des badges
        badges_gagnes = evaluer_badges(eleve)

        return Response({
            "message": "XP ajoutés avec succès.",
            "xp_total": eleve.points_gamification,
            "streak": eleve.streak_jours,
            "nouveaux_badges": badges_gagnes
        }, status=status.HTTP_200_OK)

class BadgeListView(generics.ListAPIView):
    queryset = Badges.objects.filter(actif=True)
    serializer_class = BadgeSerializer
    permission_classes = [IsAuthenticated]

class MesBadgesView(generics.ListAPIView):
    serializer_class = EleveBadgeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return EleveBadges.objects.none()
        return EleveBadges.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)

class LeaderboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        region = request.query_params.get("region")
        niveau = request.query_params.get("niveau")
        
        queryset = Eleves.objects.filter(actif=True)
        if region:
            queryset = queryset.filter(region=region)
        if niveau:
            queryset = queryset.filter(niveau_scolaire=niveau)
            
        # Trie par points descendant, limite au Top 50
        top_eleves = queryset.order_by('-points_gamification')[:50]
        
        data = []
        position_actuelle = None
        user_id = str(request.user.id_utilisateur)
        
        for index, el in enumerate(top_eleves):
            data.append({
                "rang": index + 1,
                "nom": el.nom,
                "prenom": el.prenom,
                "points": el.points_gamification,
                "region": el.region,
                "niveau": el.niveau_scolaire,
                "avatar": el.avatar_url
            })
            if str(el.id_utilisateur) == user_id:
                position_actuelle = index + 1
                
        return Response({
            "leaderboard": data,
            "ma_position": position_actuelle
        }, status=status.HTTP_200_OK)
