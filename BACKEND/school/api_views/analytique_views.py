from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from school.models import Eleves, Diagnostics, Lacunes, Matieres
from school.serializers import DiagnosticSerializer, LacuneSerializer

class DiagnosticListView(generics.ListCreateAPIView):
    serializer_class = DiagnosticSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return Diagnostics.objects.none()
        return Diagnostics.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != 'eleve':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Seuls les élèves peuvent soumettre un diagnostic.")
            
        eleve = Eleves.objects.get(id_utilisateur=user.id_utilisateur)
        diagnostic = serializer.save(id_eleve=eleve)
        
        # Mettre à jour la date_diagnostic de l'élève
        eleve.date_diagnostic = timezone.now().date()
        eleve.save(update_fields=['date_diagnostic'])

        # Création automatique des lacunes si fournies dans la requête sous forme brute
        # Note : On suppose ici que le front peut envoyer "lacunes_data" dans la requête.
        lacunes_data = self.request.data.get('lacunes_data', [])
        for ld in lacunes_data:
            try:
                matiere = Matieres.objects.get(code=ld.get('matiere_code'))
                Lacunes.objects.create(
                    id_eleve=eleve,
                    id_matiere=matiere,
                    id_diagnostic=diagnostic,
                    chapitre=ld.get('chapitre', 'Général'),
                    notion=ld.get('notion', 'Inconnu'),
                    taux_maitrise=ld.get('taux_maitrise', 0)
                )
            except Matieres.DoesNotExist:
                continue

class LacuneListView(generics.ListAPIView):
    serializer_class = LacuneSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return Lacunes.objects.none()
        
        queryset = Lacunes.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)
        statut = self.request.query_params.get('statut')
        if statut:
            queryset = queryset.filter(statut=statut)
        return queryset

class LacuneDetailView(generics.UpdateAPIView):
    serializer_class = LacuneSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'id_lacune'

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return Lacunes.objects.none()
        return Lacunes.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Dernier diagnostic
        dernier_diag = Diagnostics.objects.filter(id_eleve=eleve).order_by('-date_passage').first()
        
        # Lacunes non maîtrisées (Top 3)
        lacunes_actives = Lacunes.objects.filter(id_eleve=eleve).exclude(statut='maitrisee').order_by('taux_maitrise')[:3]

        return Response({
            "stats_globales": {
                "points_gamification": eleve.points_gamification,
                "streak_jours": eleve.streak_jours,
                "score_global": eleve.score_global
            },
            "dernier_diagnostic": DiagnosticSerializer(dernier_diag).data if dernier_diag else None,
            "lacunes_actives": LacuneSerializer(lacunes_actives, many=True).data
        }, status=status.HTTP_200_OK)
