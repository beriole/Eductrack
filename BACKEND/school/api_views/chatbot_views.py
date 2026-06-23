"""EduBot — assistant pédagogique IA, ancré sur le programme et le contenu de l'app.

Améliorations clés :
- Personnalisation (niveau, série, cycle, langue, lacunes de l'élève).
- Bilingue (français / anglais) selon le sous-système de l'élève.
- Ancrage (RAG) : répond à partir des COURS publiés de la classe + cite ses sources.
- Vision : peut analyser la photo d'un exercice.
- Mode pédagogique : « guide » (socratique, par défaut) ou « direct ».
- Quota par formule d'abonnement + mémoire résumée des longues conversations.
"""
import uuid
import json
import logging

from django.core.cache import cache
from django.db.models import Q
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from school.models import Eleves, MessagesChatbot, Matieres, Cours, Lacunes, Abonnements
from school.serializers import MessageChatbotSerializer
from school import ai_service

logger = logging.getLogger(__name__)

FREE_DAILY_LIMIT = 15          # messages/jour pour Basic (ou sans abonnement)
HISTORY_WINDOW = 12            # messages bruts gardés dans le contexte
RAG_MAX = 2                    # nb de cours injectés comme source


# ─── Personnalisation ────────────────────────────────────────────────────────

def _langue_eleve(eleve, user):
    # Le sous-système prime (un anglophone répond en anglais, un francophone en
    # français) ; sinon on suit la langue d'interface du compte.
    systeme = getattr(eleve, 'systeme', None)
    if systeme == 'anglophone':
        return 'en'
    if systeme == 'francophone':
        return 'fr'
    return 'en' if getattr(user, 'langue', 'fr') == 'en' else 'fr'


def _cycle(niveau, langue):
    college_fr = {'6e', '5e', '4e', '3e'}
    olevel = {'Form1', 'Form2', 'Form3', 'Form4', 'Form5'}
    if niveau in college_fr:
        return "collège (1er cycle, BEPC)"
    if niveau in olevel:
        return "secondary / O-Level (GCE O/L)"
    if niveau in {'LowerSixth', 'UpperSixth'}:
        return "high school / A-Level (GCE A/L)"
    return "lycée (2nd cycle, BACCALAURÉAT)"


def _lacunes(eleve):
    libs = list(
        Lacunes.objects.filter(id_eleve=eleve, statut__in=('detectee', 'en_cours'))
        .select_related('id_matiere').order_by('taux_maitrise')[:3]
        .values_list('id_matiere__nom', 'notion')
    )
    return [f"{m} — {n}" for m, n in libs]


def _rag(eleve, requete, matiere):
    """Récupère jusqu'à RAG_MAX cours publiés pertinents de la classe de l'élève."""
    qs = Cours.objects.filter(statut='publie', niveau=eleve.niveau_scolaire).select_related('id_matiere')
    if matiere:
        qs = qs.filter(id_matiere=matiere)
    mots = [w for w in requete.split() if len(w) > 3][:6]
    if mots:
        f = Q()
        for w in mots:
            f |= Q(titre__icontains=w) | Q(contenu__icontains=w)
        ranked = list(qs.filter(f)[:RAG_MAX])
    else:
        ranked = []
    if len(ranked) < RAG_MAX:
        ids = {c.id_cours for c in ranked}
        ranked += [c for c in qs.exclude(id_cours__in=ids)[:RAG_MAX - len(ranked)]]

    extraits, sources = [], []
    for c in ranked:
        extrait = (c.contenu or '')[:600]
        extraits.append(f"### {c.titre} ({c.id_matiere.nom})\n{extrait}")
        sources.append({'id_cours': str(c.id_cours), 'titre': c.titre,
                        'matiere_nom': c.id_matiere.nom, 'matiere_code': c.id_matiere.code})
    return "\n\n".join(extraits), sources


def _construire_system(eleve, user, matiere, mode, contexte_rag):
    langue = _langue_eleve(eleve, user)
    niveau = eleve.niveau_scolaire or '?'
    serie = f", série {eleve.serie}" if eleve.serie else ""
    cycle = _cycle(niveau, langue)
    lacunes = _lacunes(eleve)
    prenom = user.prenom or "l'élève"

    if langue == 'en':
        base = (
            f"You are EduBot, a pedagogical tutor for a Cameroonian student named {prenom}, "
            f"in {niveau}{serie} ({cycle}). Always reply in ENGLISH, adapting vocabulary and "
            f"difficulty to this exact class — never childish for upper classes, never off-syllabus. "
            f"Stay strictly within the Cameroonian GCE programme and school subjects. "
            f"Use LaTeX between $...$ for math. Be concise (max 3 short paragraphs)."
        )
        guide = ("TEACHING MODE: guide the student step by step with questions and hints; "
                 "do NOT give the final answer directly unless they insist.")
        direct = "Give a clear, complete worked solution."
        socle = "Base your answer ONLY on the COURSE EXTRACTS below when relevant, and mention the course title you used. If they don't cover it, rely on the official syllabus and say so."
        faibles = ("Known weak topics: " + "; ".join(lacunes)) if lacunes else ""
    else:
        base = (
            f"Tu es EduBot, un tuteur pédagogique pour {prenom}, élève camerounais en "
            f"{niveau}{serie} ({cycle}). Réponds TOUJOURS en français, en adaptant le vocabulaire "
            f"et la difficulté EXACTEMENT à cette classe — jamais enfantin pour les grandes classes, "
            f"jamais hors-programme. Reste strictement dans le programme camerounais (MINESEC) et les "
            f"sujets scolaires. Utilise LaTeX entre $...$ pour les maths. Sois concis (3 paragraphes max)."
        )
        guide = ("MODE PÉDAGOGIQUE : guide l'élève pas à pas par des questions et des indices ; "
                 "ne donne PAS la réponse finale directement, sauf s'il insiste.")
        direct = "Donne une solution claire et complète, bien rédigée."
        socle = ("Appuie ta réponse UNIQUEMENT sur les EXTRAITS DE COURS ci-dessous quand c'est "
                 "pertinent, et cite le titre du cours utilisé. S'ils ne couvrent pas la question, "
                 "appuie-toi sur le programme officiel et précise-le.")
        faibles = ("Notions à renforcer chez l'élève : " + "; ".join(lacunes)) if lacunes else ""

    parts = [base, guide if mode == 'guide' else direct, faibles]
    if matiere:
        parts.append(f"{'Subject' if langue == 'en' else 'Matière'} : {matiere.nom}.")
    if contexte_rag:
        parts.append(socle)
        parts.append(("COURSE EXTRACTS:\n" if langue == 'en' else "EXTRAITS DE COURS :\n") + contexte_rag)
    return "\n\n".join(p for p in parts if p)


def _formule_active(user):
    abo = Abonnements.objects.filter(
        id_utilisateur=user, statut='actif', date_expiration__gte=timezone.localdate()
    ).order_by('-date_expiration').first()
    return abo.formule if abo else 'basic'


def _quota_restant(eleve, user):
    """Renvoie (illimite, restant). Payant (>=standard) = illimité."""
    if _formule_active(user) in ('standard', 'premium', 'pro'):
        return True, None
    utilises = MessagesChatbot.objects.filter(
        id_eleve=eleve, role='user', horodatage__date=timezone.localdate()).count()
    return False, max(0, FREE_DAILY_LIMIT - utilises)


def _resume_memoire(eleve, session_chat, total):
    """Résumé des messages anciens (au-delà de la fenêtre) pour garder le contexte."""
    if total <= HISTORY_WINDOW + 2:
        return ""
    key = f"chatsum:{session_chat}"
    resume = cache.get(key)
    if resume:
        return resume
    anciens = list(
        MessagesChatbot.objects.filter(id_eleve=eleve, session_chat=session_chat)
        .order_by('horodatage')[: total - HISTORY_WINDOW]
    )
    corpus = "\n".join(f"{m.role}: {m.contenu[:200]}" for m in anciens)
    try:
        resume = ai_service.chat(
            [{"role": "user", "content": f"Résume en 3 phrases le contexte de cette conversation:\n{corpus}"}],
            max_tokens=180, temperature=0.3)
        cache.set(key, resume, 1800)
    except ai_service.AIUnavailable:
        resume = ""
    return resume


class ChatbotMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        contenu = (request.data.get('contenu') or '').strip()
        image_b64 = request.data.get('image_base64')
        if not contenu and not image_b64:
            return Response({"error": "Message vide."}, status=status.HTTP_400_BAD_REQUEST)

        # Quota (formule Basic / sans abonnement).
        illimite, restant = _quota_restant(eleve, request.user)
        if not illimite and restant <= 0:
            return Response({
                "error": "Limite quotidienne atteinte (formule Basic). Passe à Standard pour un accès illimité.",
                "quota_atteint": True,
            }, status=status.HTTP_402_PAYMENT_REQUIRED)

        mode = request.data.get('mode') if request.data.get('mode') in ('guide', 'direct') else 'guide'
        matiere_code = request.data.get('matiere_code')
        session_chat = request.data.get('session_chat') or str(uuid.uuid4())
        matiere = Matieres.objects.filter(code=matiere_code).first() if matiere_code else None

        contexte_rag, sources = _rag(eleve, contenu, matiere)
        system = _construire_system(eleve, request.user, matiere, mode, contexte_rag)

        user_msg = MessagesChatbot.objects.create(
            id_eleve=eleve, role='user', contenu=contenu or "[photo d'un exercice]",
            id_matiere=matiere, session_chat=session_chat)

        try:
            if image_b64:
                data_url = image_b64 if image_b64.startswith('data:') else f"data:image/jpeg;base64,{image_b64}"
                reponse = ai_service.chat_vision(
                    contenu or "Explique et corrige cet exercice, étape par étape.",
                    data_url, system=system)
            else:
                total = MessagesChatbot.objects.filter(id_eleve=eleve, session_chat=session_chat).count()
                resume = _resume_memoire(eleve, session_chat, total)
                if resume:
                    system += f"\n\n{'CONVERSATION SUMMARY' if _langue_eleve(eleve, request.user) == 'en' else 'RÉSUMÉ DE LA CONVERSATION'} : {resume}"
                historique = list(
                    MessagesChatbot.objects.filter(id_eleve=eleve, session_chat=session_chat)
                    .order_by('-horodatage')[:HISTORY_WINDOW])
                messages_api = [{"role": m.role, "content": m.contenu} for m in reversed(historique)]
                reponse = ai_service.chat(messages_api, system=system, max_tokens=1024)
        except ai_service.AIUnavailable as exc:
            logger.warning("EduBot IA indisponible: %s", exc)
            reponse = ("EduBot a un souci de connexion à l'IA. Réessaie dans un instant — "
                       "en attendant, consulte les cours de ta classe dans l'onglet Cours.")

        assistant_msg = MessagesChatbot.objects.create(
            id_eleve=eleve, role='assistant', contenu=reponse,
            id_matiere=matiere, session_chat=session_chat)

        _, restant = _quota_restant(eleve, request.user)
        return Response({
            "session_chat": session_chat,
            "message": MessageChatbotSerializer(user_msg).data,
            "reponse": MessageChatbotSerializer(assistant_msg).data,
            "sources": sources,
            "mode": mode,
            "quota_illimite": illimite,
            "quota_restant": restant,
        }, status=status.HTTP_200_OK)


class ChatbotStreamView(APIView):
    """POST /chatbot/message/stream/ — réponse EduBot en flux (tokens en direct).

    Renvoie d'abord une ligne JSON de métadonnées (session, id du message,
    sources), puis le texte généré au fil de l'eau. Repli côté client si le flux
    n'est pas supporté."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        eleve = Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not eleve:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        contenu = (request.data.get('contenu') or '').strip()
        if not contenu:
            return Response({"error": "Message vide."}, status=status.HTTP_400_BAD_REQUEST)

        illimite, restant = _quota_restant(eleve, request.user)
        if not illimite and restant <= 0:
            return Response({"error": "Limite quotidienne atteinte (Basic).", "quota_atteint": True},
                            status=status.HTTP_402_PAYMENT_REQUIRED)

        mode = request.data.get('mode') if request.data.get('mode') in ('guide', 'direct') else 'guide'
        matiere = Matieres.objects.filter(code=request.data.get('matiere_code')).first() if request.data.get('matiere_code') else None
        session_chat = request.data.get('session_chat') or str(uuid.uuid4())

        contexte_rag, sources = _rag(eleve, contenu, matiere)
        system = _construire_system(eleve, request.user, matiere, mode, contexte_rag)

        MessagesChatbot.objects.create(id_eleve=eleve, role='user', contenu=contenu,
                                       id_matiere=matiere, session_chat=session_chat)
        assistant_msg = MessagesChatbot.objects.create(id_eleve=eleve, role='assistant', contenu='',
                                                       id_matiere=matiere, session_chat=session_chat)

        total = MessagesChatbot.objects.filter(id_eleve=eleve, session_chat=session_chat).count()
        resume = _resume_memoire(eleve, session_chat, total)
        if resume:
            system += f"\n\nRÉSUMÉ : {resume}"
        historique = list(MessagesChatbot.objects.filter(id_eleve=eleve, session_chat=session_chat)
                          .exclude(id_message=assistant_msg.id_message)
                          .order_by('-horodatage')[:HISTORY_WINDOW])
        messages_api = [{"role": m.role, "content": m.contenu} for m in reversed(historique)]

        _, restant_apres = _quota_restant(eleve, request.user)

        def flux():
            meta = {"session_chat": session_chat, "id_message": str(assistant_msg.id_message),
                    "sources": sources, "mode": mode,
                    "quota_illimite": illimite, "quota_restant": restant_apres}
            yield json.dumps(meta) + "\n"
            morceaux = []
            try:
                for delta in ai_service.chat_stream(messages_api, system=system, max_tokens=1024):
                    morceaux.append(delta)
                    yield delta
            except ai_service.AIUnavailable:
                msg = "EduBot a un souci de connexion. Réessaie dans un instant."
                morceaux.append(msg)
                yield msg
            assistant_msg.contenu = ''.join(morceaux) or '...'
            assistant_msg.save(update_fields=['contenu'])

        resp = StreamingHttpResponse(flux(), content_type='text/plain; charset=utf-8')
        resp['Cache-Control'] = 'no-cache'
        resp['X-Accel-Buffering'] = 'no'  # désactive le buffering (nginx)
        return resp


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


class ChatbotFeedbackView(APIView):
    """POST /chatbot/messages/<id_message>/feedback/ — 👍/👎 sur une réponse."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id_message):
        msg = MessagesChatbot.objects.filter(
            id_message=id_message, role='assistant',
            id_eleve__id_utilisateur=request.user.id_utilisateur).first()
        if not msg:
            return Response({"error": "Message introuvable."}, status=status.HTTP_404_NOT_FOUND)
        msg.utile = bool(request.data.get('utile'))
        msg.save(update_fields=['utile'])
        return Response({"utile": msg.utile}, status=status.HTTP_200_OK)
