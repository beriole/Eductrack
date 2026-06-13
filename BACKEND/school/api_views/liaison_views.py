from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from school.models import CodeLiaison, EleveParent, Eleves, Parents
from school.serializers import ParentSerializer
from school.tasks import send_parent_link_notification


class CodeLiaisonRegenerateView(APIView):
    """L'élève régénère son code de liaison (invalide l'ancien)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Seuls les élèves peuvent régénérer leur code."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Invalider tous les anciens codes non utilisés
        CodeLiaison.objects.filter(id_eleve=eleve, utilise=False).update(utilise=True)

        # Créer un nouveau code
        nouveau_code = CodeLiaison.objects.create(id_eleve=eleve)

        return Response({
            "message": "Code de liaison régénéré.",
            "code": nouveau_code.code,
            "expire_le": nouveau_code.date_expiration,
        }, status=status.HTTP_201_CREATED)


class CodeLiaisonCurrentView(APIView):
    """L'élève consulte son code de liaison actif."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Accès réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        from django.utils import timezone
        code = CodeLiaison.objects.filter(
            id_eleve=eleve,
            utilise=False,
            date_expiration__gt=timezone.now()
        ).order_by('-date_creation').first()

        if not code:
            # Créer automatiquement si aucun code valide
            code = CodeLiaison.objects.create(id_eleve=eleve)

        return Response({
            "code": code.code,
            "expire_le": code.date_expiration,
        }, status=status.HTTP_200_OK)


class EleveParentsListView(APIView):
    """L'élève liste les parents liés à son compte."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Accès réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        liens = EleveParent.objects.filter(id_eleve=eleve, actif=True).select_related('id_parent')
        parents = [lien.id_parent for lien in liens]
        serializer = ParentSerializer(parents, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class EleveRevokeParentView(APIView):
    """L'élève révoque l'accès d'un parent."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, parent_id):
        if request.user.role != 'eleve':
            return Response({"error": "Accès réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
            lien = EleveParent.objects.get(id_eleve=eleve, id_parent__id_utilisateur=parent_id, actif=True)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)
        except EleveParent.DoesNotExist:
            return Response({"error": "Lien parent introuvable."}, status=status.HTTP_404_NOT_FOUND)

        lien.actif = False
        lien.save(update_fields=['actif'])
        return Response({"message": "Accès du parent révoqué."}, status=status.HTTP_200_OK)
