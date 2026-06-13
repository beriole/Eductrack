from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from school.serializers import RegisterSerializer, UtilisateurSerializer
from django.contrib.auth import authenticate
from django.core.cache import cache
from school.tasks import send_verification_email

class RegisterView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # Envoyer email de vérification en arrière-plan
            send_verification_email.delay(
                str(user.id_utilisateur),
                user.email,
                user.prenom or user.nom,
            )
            refresh = RefreshToken.for_user(user)
            return Response({
                "message": "Inscription réussie. Vérifiez votre email pour activer votre compte.",
                "user": UtilisateurSerializer(user).data,
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password")

        # Rate limiting logic using Redis cache (5 attempts per IP per min)
        ip = request.META.get('REMOTE_ADDR')
        cache_key = f'login_attempts_{ip}'
        attempts = cache.get(cache_key, 0)
        
        if attempts >= 5:
            return Response({"error": "Trop de tentatives. Veuillez réessayer dans 60 secondes."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = authenticate(username=email, password=password)
        if user is not None:
            # reset attempts on success
            cache.delete(cache_key)
            refresh = RefreshToken.for_user(user)
            return Response({
                "message": "Connexion réussie.",
                "user": UtilisateurSerializer(user).data,
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                }
            }, status=status.HTTP_200_OK)
        else:
            # increment attempts
            cache.set(cache_key, attempts + 1, timeout=60)
            return Response({"error": "Identifiants invalides."}, status=status.HTTP_401_UNAUTHORIZED)

class LogoutView(APIView):
    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response(status=status.HTTP_400_BAD_REQUEST)
