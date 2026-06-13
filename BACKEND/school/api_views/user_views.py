from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from school.models import Eleves, Parents, Enseignants
from school.serializers import UtilisateurSerializer, EleveSerializer, ParentSerializer, EnseignantSerializer
from django.core.files.storage import default_storage

class UserMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self, user):
        if user.role == 'eleve':
            return EleveSerializer
        elif user.role == 'parent':
            return ParentSerializer
        elif user.role == 'enseignant':
            return EnseignantSerializer
        return UtilisateurSerializer

    def get(self, request):
        user = request.user
        serializer_class = self.get_serializer_class(user)
        # Fetch actual derived model instance if possible
        if user.role == 'eleve':
            user = Eleves.objects.get(id_utilisateur=user.id_utilisateur)
        elif user.role == 'parent':
            user = Parents.objects.get(id_utilisateur=user.id_utilisateur)
        elif user.role == 'enseignant':
            user = Enseignants.objects.get(id_utilisateur=user.id_utilisateur)

        serializer = serializer_class(user)
        return Response(serializer.data)

    def patch(self, request):
        user = request.user
        serializer_class = self.get_serializer_class(user)
        
        if user.role == 'eleve':
            user = Eleves.objects.get(id_utilisateur=user.id_utilisateur)
        elif user.role == 'parent':
            user = Parents.objects.get(id_utilisateur=user.id_utilisateur)
        elif user.role == 'enseignant':
            user = Enseignants.objects.get(id_utilisateur=user.id_utilisateur)

        serializer = serializer_class(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PushTokenView(APIView):
    """Enregistre le token push (Expo ou FCM) de l'appareil de l'utilisateur."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get('push_token', '').strip()
        if not token:
            return Response({"error": "push_token requis."}, status=status.HTTP_400_BAD_REQUEST)
        request.user.push_token = token
        request.user.save(update_fields=['push_token'])
        return Response({"message": "Token push enregistré."})


class UserAvatarUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        file_obj = request.FILES.get('avatar')
        if not file_obj:
            return Response({"error": "Aucun fichier fourni."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate MIME type
        if not file_obj.content_type.startswith('image/'):
            return Response({"error": "Seuls les fichiers image sont acceptés."}, status=status.HTTP_400_BAD_REQUEST)

        # Basic local storage logic for now (could be S3 later as specified)
        file_name = default_storage.save(f"avatars/{request.user.id_utilisateur}_{file_obj.name}", file_obj)
        file_url = default_storage.url(file_name)

        user = request.user
        user.avatar_url = file_url
        user.save()

        return Response({"message": "Avatar mis à jour", "avatar_url": file_url}, status=status.HTTP_200_OK)
