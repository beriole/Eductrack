from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.cache import cache
from school.models import Utilisateur
from school.serializers import (
    EmailVerifySerializer,
    ResendVerificationSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    PasswordChangeSerializer,
)
from school.tasks import send_verification_email, send_password_reset_otp


class EmailVerifyView(APIView):
    """Vérifie le token reçu par email et active le compte."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EmailVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        uid = str(serializer.validated_data['uid'])
        token = serializer.validated_data['token']

        stored_token = cache.get(f'email_verify_{uid}')
        if not stored_token or stored_token != token:
            return Response(
                {"error": "Lien de vérification invalide ou expiré."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = Utilisateur.objects.get(id_utilisateur=uid)
        except Utilisateur.DoesNotExist:
            return Response({"error": "Utilisateur introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if user.email_verifie:
            return Response({"message": "Email déjà vérifié."}, status=status.HTTP_200_OK)

        user.email_verifie = True
        user.save(update_fields=['email_verifie'])
        cache.delete(f'email_verify_{uid}')

        return Response({"message": "Email vérifié avec succès."}, status=status.HTTP_200_OK)


class ResendVerificationEmailView(APIView):
    """Renvoie l'email de vérification si le compte n'est pas encore vérifié."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        # Anti-spam: max 3 renvois par heure
        throttle_key = f'resend_verify_{email}'
        attempts = cache.get(throttle_key, 0)
        if attempts >= 3:
            return Response(
                {"error": "Trop de demandes. Réessayez dans une heure."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            user = Utilisateur.objects.get(email=email)
        except Utilisateur.DoesNotExist:
            # Ne pas révéler si l'email existe
            return Response({"message": "Si cet email existe, un lien vous a été envoyé."}, status=status.HTTP_200_OK)

        if user.email_verifie:
            return Response({"message": "Cet email est déjà vérifié."}, status=status.HTTP_200_OK)

        cache.set(throttle_key, attempts + 1, timeout=3600)
        send_verification_email.delay(str(user.id_utilisateur), user.email, user.prenom or user.nom)

        return Response({"message": "Email de vérification envoyé."}, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    """Envoie un OTP à 6 chiffres par email pour réinitialiser le mot de passe."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']

        # Anti-spam: max 3 demandes par 15 minutes
        throttle_key = f'otp_throttle_{email}'
        attempts = cache.get(throttle_key, 0)
        if attempts >= 3:
            return Response(
                {"error": "Trop de demandes. Réessayez dans 15 minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(throttle_key, attempts + 1, timeout=900)

        if Utilisateur.objects.filter(email=email).exists():
            send_password_reset_otp.delay(email)

        # Réponse identique même si l'email n'existe pas (sécurité)
        return Response(
            {"message": "Si cet email est enregistré, vous recevrez un code sous peu."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """Vérifie l'OTP et applique le nouveau mot de passe."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        new_password = serializer.validated_data['new_password']

        try:
            user = Utilisateur.objects.get(email=email)
        except Utilisateur.DoesNotExist:
            return Response({"error": "Utilisateur introuvable."}, status=status.HTTP_404_NOT_FOUND)

        user.set_password(new_password)
        user.save(update_fields=['password'])
        cache.delete(f'otp_reset_{email}')

        return Response({"message": "Mot de passe réinitialisé avec succès."}, status=status.HTTP_200_OK)


class PasswordChangeView(APIView):
    """Change le mot de passe d'un utilisateur authentifié."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])

        return Response({"message": "Mot de passe modifié avec succès."}, status=status.HTTP_200_OK)
