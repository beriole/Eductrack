import uuid
import logging
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from school.models import Eleves, MessagesChatbot, Matieres
from school.serializers import MessageChatbotSerializer
from school import ai_service

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "Tu es EduBot, un assistant pédagogique pour lycéens camerounais. "
    "Tu aides à comprendre les cours, préparer le BAC/BEPC et résoudre des exercices. "
    "Réponds toujours en français, de façon claire et encourageante. "
    "Utilise des exemples concrets adaptés au contexte camerounais. "
    "Limite-toi aux sujets scolaires. Sois bref : 3 paragraphes maximum."
)


class ChatbotMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        contenu = request.data.get('contenu', '').strip()
        if not contenu:
            return Response({"error": "Le message ne peut pas être vide."}, status=status.HTTP_400_BAD_REQUEST)

        matiere_code = request.data.get('matiere_code')
        session_chat = request.data.get('session_chat') or str(uuid.uuid4())

        matiere = None
        if matiere_code:
            matiere = Matieres.objects.filter(code=matiere_code).first()

        # Récupérer l'historique de la session (10 derniers messages)
        historique = list(
            MessagesChatbot.objects.filter(id_eleve=eleve, session_chat=session_chat)
            .order_by('-horodatage')[:10]
        )
        messages_api = [{"role": m.role, "content": m.contenu} for m in reversed(historique)]
        messages_api.append({"role": "user", "content": contenu})

        system = SYSTEM_PROMPT
        if matiere:
            system += f" Contexte : matière '{matiere.nom}'."

        # Sauvegarder le message utilisateur
        user_msg = MessagesChatbot.objects.create(
            id_eleve=eleve,
            role='user',
            contenu=contenu,
            id_matiere=matiere,
            session_chat=session_chat,
        )

        try:
            reponse = ai_service.chat(messages_api, system=system, max_tokens=1024)
        except ai_service.AIUnavailable as exc:
            logger.warning("EduBot IA indisponible: %s", exc)
            reponse = (
                "Bonjour ! Je suis EduBot. Je rencontre un souci de connexion à l'IA "
                "pour l'instant — réessaie dans un moment et je t'aiderai avec plaisir !"
            )

        assistant_msg = MessagesChatbot.objects.create(
            id_eleve=eleve,
            role='assistant',
            contenu=reponse,
            id_matiere=matiere,
            session_chat=session_chat,
        )

        return Response({
            "session_chat": session_chat,
            "message": MessageChatbotSerializer(user_msg).data,
            "reponse": MessageChatbotSerializer(assistant_msg).data,
        }, status=status.HTTP_200_OK)


class ChatbotHistoriqueView(generics.ListAPIView):
    serializer_class = MessageChatbotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return MessagesChatbot.objects.none()
        session_chat = self.request.query_params.get('session_chat')
        qs = MessagesChatbot.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)
        if session_chat:
            qs = qs.filter(session_chat=session_chat)
        return qs.order_by('horodatage')
