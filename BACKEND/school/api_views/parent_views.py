from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from school.models import CodeLiaison, EleveParent, Eleves, Parents, RapportsParentaux
from school.serializers import EleveSerializer, RapportParentalSerializer
from django.utils import timezone
import datetime

class LierEnfantView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents peuvent lier un enfant."}, status=status.HTTP_403_FORBIDDEN)
        
        code_str = request.data.get('code')
        if not code_str:
            return Response({"error": "Le code de liaison est requis."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            code_obj = CodeLiaison.objects.get(code=code_str)
        except CodeLiaison.DoesNotExist:
            return Response({"error": "Code invalide."}, status=status.HTTP_404_NOT_FOUND)

        if not code_obj.est_valide():
            return Response({"error": "Ce code a expiré ou a déjà été utilisé."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Parents.DoesNotExist:
            return Response({"error": "Profil parent introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Create relation
        EleveParent.objects.get_or_create(id_eleve=code_obj.id_eleve, id_parent=parent)
        
        # Mark code as used
        code_obj.utilise = True
        code_obj.save()

        return Response({"message": "Enfant lié avec succès."}, status=status.HTTP_200_OK)

class EnfantsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents ont accès à cette vue."}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Parents.DoesNotExist:
            return Response({"error": "Profil parent introuvable."}, status=status.HTTP_404_NOT_FOUND)
        
        liens = EleveParent.objects.filter(id_parent=parent, actif=True)
        enfants = [lien.id_eleve for lien in liens]
        
        serializer = EleveSerializer(enfants, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class LienParentEleveDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, enfant_id):
        if request.user.role != 'parent':
            return Response({"error": "Accès refusé."}, status=status.HTTP_403_FORBIDDEN)

        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
            lien = EleveParent.objects.get(id_parent=parent, id_eleve__id_utilisateur=enfant_id)
            lien.actif = False # Soft delete
            lien.save()
            return Response({"message": "Lien révoqué."}, status=status.HTTP_204_NO_CONTENT)
        except (Parents.DoesNotExist, EleveParent.DoesNotExist):
            return Response({"error": "Lien introuvable."}, status=status.HTTP_404_NOT_FOUND)

class RapportParentalListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents y ont accès."}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Parents.DoesNotExist:
            return Response({"error": "Profil introuvable."}, status=status.HTTP_404_NOT_FOUND)
            
        enfant_id = request.query_params.get('enfant_id')
        rapports = RapportsParentaux.objects.filter(id_parent=parent)
        
        if enfant_id:
            rapports = rapports.filter(id_eleve__id_utilisateur=enfant_id)
            
        serializer = RapportParentalSerializer(rapports.order_by('-date_generation'), many=True)
        return Response(serializer.data)

class RapportParentalGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents y ont accès."}, status=status.HTTP_403_FORBIDDEN)
            
        enfant_id = request.data.get('enfant_id')
        if not enfant_id:
            return Response({"error": "enfant_id est requis."}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
            lien = EleveParent.objects.get(id_parent=parent, id_eleve__id_utilisateur=enfant_id, actif=True)
            eleve = lien.id_eleve
        except (Parents.DoesNotExist, EleveParent.DoesNotExist):
            return Response({"error": "Enfant introuvable ou non lié."}, status=status.HTTP_404_NOT_FOUND)

        # Déterminer la période (par ex. les 7 derniers jours)
        now = timezone.now().date()
        debut = now - datetime.timedelta(days=7)

        # Vérifier si un rapport existe déjà pour aujourd'hui
        if RapportsParentaux.objects.filter(id_parent=parent, id_eleve=eleve, periode_fin=now).exists():
            return Response({"message": "Un rapport a déjà été généré pour aujourd'hui."}, status=status.HTTP_400_BAD_REQUEST)

        # Génération à la volée
        rapport = RapportsParentaux.objects.create(
            id_parent=parent,
            id_eleve=eleve,
            periode_debut=debut,
            periode_fin=now,
            moyenne_globale=eleve.score_global,
            temps_etude_total=120, # Valeur factice pour le MVP
            nb_sessions=5, # Valeur factice pour le MVP
            matieres_travaillees=["Mathématiques", "Physique"],
            lacunes_principales=["Vecteurs", "Cinématique"],
            envoye=True
        )

        return Response({
            "message": "Rapport généré avec succès.",
            "rapport": RapportParentalSerializer(rapport).data
        }, status=status.HTTP_201_CREATED)

