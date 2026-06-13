"""Assistant pédagogique pendant l'examen (Module 1.4).

Garantie anti-triche : la réponse correcte n'est JAMAIS transmise au modèle,
donc l'IA ne peut pas la révéler. Elle se contente d'expliquer, reformuler ou
donner un indice. Si l'IA est indisponible, un fallback à base de règles répond.
"""
import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from school.models import Questions, SessionsExamen
from school import ai_service

logger = logging.getLogger(__name__)

ACTIONS = {
    'expliquer': "Explique cet énoncé avec des mots simples pour qu'il soit compris.",
    'reformuler': "Reformule cette question de façon plus simple et plus courte.",
    'indice': "Donne UN seul indice progressif pour orienter la réflexion.",
}

SYSTEM_PROMPT = (
    "Tu es un tuteur pédagogique bienveillant pour un lycéen camerounais qui "
    "compose actuellement un examen. RÈGLE ABSOLUE : tu ne donnes JAMAIS la "
    "réponse finale, ni le résultat, ni la bonne option. Tu aides seulement à "
    "comprendre et à réfléchir. Réponds en français, 3 phrases maximum, ton "
    "encourageant."
)

# Fallback (sans IA) — réponses génériques mais utiles, par action.
FALLBACK = {
    'expliquer': (
        "Relis l'énoncé phrase par phrase et souligne les mots-clés. "
        "Identifie ce qui est donné et ce qui est demandé : reformule la question "
        "avec tes propres mots avant de chercher la solution."
    ),
    'reformuler': (
        "Autrement dit : que cherche-t-on exactement ici ? Repère la donnée de "
        "départ et l'objectif final, puis pose-toi la question « de quoi ai-je "
        "besoin pour passer de l'un à l'autre ? »."
    ),
    'indice': (
        "Commence par repérer la notion du cours concernée par cette question, "
        "puis rappelle-toi la formule ou la règle associée. Avance étape par "
        "étape sans sauter de raisonnement."
    ),
}


class QuestionAssistantView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id_question):
        action = (request.data.get('action') or 'expliquer').strip()
        if action not in ACTIONS:
            return Response({"error": "Action invalide."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            question = Questions.objects.get(id_question=id_question)
        except Questions.DoesNotExist:
            return Response({"error": "Question introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Tracer l'usage de l'aide sur la session (si fournie et appartenant à l'élève).
        id_session = request.data.get('id_session')
        if id_session:
            SessionsExamen.objects.filter(
                id_session=id_session,
                id_eleve__id_utilisateur=request.user.id_utilisateur,
                statut='en_cours',
            ).update(aide_utilisee=True)

        # On ne transmet QUE l'énoncé et les options — jamais la réponse correcte.
        options_txt = ""
        if question.type_question in ('qcm', 'vrai_faux') and question.options:
            opts = question.options
            lignes = []
            for i, o in enumerate(opts):
                texte = o.get('texte', o) if isinstance(o, dict) else o
                lignes.append(f"{chr(65 + i)}. {texte}")
            options_txt = "\nOptions :\n" + "\n".join(lignes)

        prompt = (
            f"{ACTIONS[action]}\n\n"
            f"Énoncé de la question :\n{question.enonce}{options_txt}\n\n"
            "Rappel : ne révèle pas la réponse, aide seulement à comprendre."
        )

        source = "ia"
        try:
            texte = ai_service.generate(prompt, system=SYSTEM_PROMPT, max_tokens=256, temperature=0.6)
        except ai_service.AIUnavailable:
            texte = FALLBACK[action]
            source = "fallback"

        return Response({"action": action, "reponse": texte, "source": source}, status=status.HTTP_200_OK)
