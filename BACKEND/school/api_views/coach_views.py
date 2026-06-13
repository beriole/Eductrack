"""Coach IA — messages de coaching personnalisés (Module 10).

Analyse les données réelles de l'élève (assiduité, streak, résultats récents,
lacunes) puis génère un message de coaching court et motivant via l'IA. Si l'IA
est indisponible, un fallback à base de règles choisit un message adapté à la
situation. Utilisé à la demande (`GET /coach/conseil/`) et par la tâche Celery
quotidienne `coacher_eleves`.
"""
import datetime
import logging

from django.db.models import Avg
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from school.models import Eleves, SessionsExamen, SessionsFocus, Lacunes
from school import ai_service

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "Tu es un coach scolaire bienveillant et motivant pour un lycéen camerounais. "
    "Tu t'adresses à lui en le tutoyant, avec chaleur et énergie. Tu écris en "
    "français, 2 à 3 phrases maximum, et tu termines TOUJOURS par UNE action "
    "concrète et simple à faire aujourd'hui. Pas de liste, pas de markdown."
)


def construire_contexte(eleve):
    """Rassemble les signaux d'activité et de performance de l'élève."""
    now = timezone.now()
    semaine = now - datetime.timedelta(days=7)

    derniere_exam = (
        SessionsExamen.objects.filter(id_eleve=eleve)
        .order_by('-date_debut').values_list('date_debut', flat=True).first()
    )
    derniere_focus = (
        SessionsFocus.objects.filter(id_eleve=eleve)
        .order_by('-date_debut').values_list('date_debut', flat=True).first()
    )
    dates = [d for d in (derniere_exam, derniere_focus) if d]
    jours_inactif = (now - max(dates)).days if dates else None

    sessions_recentes = SessionsExamen.objects.filter(
        id_eleve=eleve, statut='termine', date_fin__gte=semaine,
    )
    nb_sessions_7j = sessions_recentes.count()
    moyenne_recente = sessions_recentes.aggregate(m=Avg('note_obtenue'))['m']

    lacune = (
        Lacunes.objects.filter(id_eleve=eleve, statut__in=('detectee', 'en_cours'))
        .select_related('id_matiere').order_by('taux_maitrise').first()
    )

    return {
        'prenom': eleve.prenom,
        'streak_jours': eleve.streak_jours,
        'score_global': eleve.score_global,
        'jours_inactif': jours_inactif,
        'nb_sessions_7j': nb_sessions_7j,
        'moyenne_recente': round(float(moyenne_recente), 1) if moyenne_recente is not None else None,
        'lacune_matiere': lacune.id_matiere.nom if lacune else None,
        'lacune_notion': lacune.notion if lacune else None,
        'jamais_actif': not dates,
    }


def _situation(ctx):
    """Classe la situation de l'élève pour orienter le ton du message."""
    if ctx['jamais_actif']:
        return 'nouveau'
    if ctx['jours_inactif'] is not None and ctx['jours_inactif'] >= 3:
        return 'inactif'
    if ctx['lacune_notion']:
        return 'lacune'
    if ctx['streak_jours'] and ctx['streak_jours'] >= 3:
        return 'progression'
    return 'encouragement'


def _fallback(ctx):
    """Message de coaching sans IA, adapté à la situation détectée."""
    p = ctx['prenom']
    situation = _situation(ctx)
    if situation == 'nouveau':
        return (
            f"Bienvenue {p} ! Le meilleur moment pour commencer, c'est maintenant. "
            "Lance ton premier exercice du jour pour découvrir ton niveau."
        )
    if situation == 'inactif':
        return (
            f"On ne t'a pas vu depuis {ctx['jours_inactif']} jours, {p}. "
            "Pas de culpabilité, juste un nouveau départ : fais une courte session "
            "de 15 minutes aujourd'hui pour relancer la machine."
        )
    if situation == 'lacune':
        return (
            f"{p}, ta notion « {ctx['lacune_notion']} » en {ctx['lacune_matiere']} "
            "mérite un peu d'attention. Génère un exercice ciblé dessus aujourd'hui : "
            "quelques minutes suffisent pour progresser."
        )
    if situation == 'progression':
        return (
            f"Bravo {p}, {ctx['streak_jours']} jours d'affilée ! Ta régularité paie. "
            "Garde le rythme avec une session aujourd'hui pour ne pas casser ta série."
        )
    return (
        f"Chaque effort compte, {p}. Fixe-toi un petit objectif clair pour "
        "aujourd'hui : une session d'étude ou un exercice, et tu seras fier de toi ce soir."
    )


def _construire_prompt(ctx):
    """Transforme le contexte en faits que l'IA peut exploiter."""
    faits = [f"Prénom : {ctx['prenom']}"]
    if ctx['jamais_actif']:
        faits.append("N'a encore jamais travaillé sur l'app (nouvel élève).")
    else:
        if ctx['jours_inactif'] is not None:
            faits.append(f"Inactif depuis {ctx['jours_inactif']} jour(s).")
        faits.append(f"Sessions terminées cette semaine : {ctx['nb_sessions_7j']}.")
        if ctx['moyenne_recente'] is not None:
            faits.append(f"Moyenne récente : {ctx['moyenne_recente']}/20.")
    if ctx['streak_jours']:
        faits.append(f"Série en cours : {ctx['streak_jours']} jour(s) consécutif(s).")
    if ctx['lacune_notion']:
        faits.append(
            f"Principale lacune : « {ctx['lacune_notion']} » en {ctx['lacune_matiere']}."
        )
    return (
        "Voici la situation de l'élève :\n- " + "\n- ".join(faits) +
        "\n\nÉcris-lui un message de coaching personnalisé et motivant qui tient "
        "compte de ces faits."
    )


def generer_conseil_coach(eleve):
    """Renvoie (titre, message, source, contexte) pour un élève donné."""
    ctx = construire_contexte(eleve)
    source = 'ia'
    try:
        message = ai_service.generate(
            _construire_prompt(ctx), system=SYSTEM_PROMPT,
            max_tokens=200, temperature=0.8,
        )
    except ai_service.AIUnavailable:
        message = _fallback(ctx)
        source = 'fallback'
    return "Message de ton coach", message, source, ctx


class CoachConseilView(APIView):
    """GET /coach/conseil/ — conseil de coaching personnalisé pour l'élève connecté.

    Lecture seule : ne crée pas de notification (peut être appelé à volonté).
    La tâche Celery `coacher_eleves` se charge de la notification quotidienne.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil élève introuvable."}, status=status.HTTP_404_NOT_FOUND)

        titre, message, source, ctx = generer_conseil_coach(eleve)
        return Response(
            {"titre": titre, "message": message, "source": source, "contexte": ctx},
            status=status.HTTP_200_OK,
        )
