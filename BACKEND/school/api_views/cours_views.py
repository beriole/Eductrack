from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from school.models import Cours, Enseignants
from school.serializers import CoursSerializer
from school.utils import send_email_async
from django.conf import settings

class CoursListView(generics.ListCreateAPIView):
    serializer_class = CoursSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['id_matiere', 'niveau', 'serie', 'statut']

    def get_queryset(self):
        user = self.request.user
        if user.role == 'enseignant':
            # Les enseignants voient tous les cours publiés + les leurs
            enseignant = Enseignants.objects.get(id_utilisateur=user.id_utilisateur)
            return Cours.objects.filter(id_enseignant=enseignant) | Cours.objects.filter(statut='publie')
        else:
            # Les élèves et autres ne voient que les cours publiés
            return Cours.objects.filter(statut='publie')

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != 'enseignant':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Seuls les enseignants peuvent créer des cours.")
        enseignant = Enseignants.objects.get(id_utilisateur=user.id_utilisateur)
        serializer.save(id_enseignant=enseignant, statut='brouillon')

class CoursDetailView(generics.RetrieveUpdateAPIView):
    queryset = Cours.objects.all()
    serializer_class = CoursSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'id_cours'

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Increment views only if it's not the author
        if request.user.role != 'enseignant' or str(instance.id_enseignant.id_utilisateur) != str(request.user.id_utilisateur):
            instance.nb_vues += 1
            instance.save(update_fields=['nb_vues'])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_update(self, serializer):
        instance = self.get_object()
        if str(instance.id_enseignant.id_utilisateur) != str(self.request.user.id_utilisateur):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Vous ne pouvez modifier que vos propres cours.")
        serializer.save()

class CoursSoumettreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id_cours):
        try:
            cours = Cours.objects.get(id_cours=id_cours)
            if str(cours.id_enseignant.id_utilisateur) != str(request.user.id_utilisateur):
                return Response({"error": "Vous n'êtes pas l'auteur de ce cours."}, status=status.HTTP_403_FORBIDDEN)
            
            if cours.statut != 'brouillon':
                return Response({"error": "Seuls les brouillons peuvent être soumis."}, status=status.HTTP_400_BAD_REQUEST)
            
            cours.statut = 'en_revision'
            cours.save(update_fields=['statut'])

            # Send Email notification asynchronously
            send_email_async(
                subject=f"Nouveau cours soumis pour révision : {cours.titre}",
                message=f"L'enseignant {cours.id_enseignant.nom} a soumis le cours '{cours.titre}' pour révision.",
                recipient_list=[settings.EMAIL_HOST_USER] # Simulate sending to admin
            )

            return Response({"message": "Cours soumis pour révision avec succès."}, status=status.HTTP_200_OK)
        except Cours.DoesNotExist:
            return Response({"error": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)
