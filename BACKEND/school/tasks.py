import random
import string
import datetime
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone


def _generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))


def _generate_token(length=40):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_verification_email(self, user_id: str, email: str, prenom: str):
    """Envoie un code de vérification à 6 chiffres (valable 24h).

    Modèle OTP (et non lien) : fonctionne sur mobile sans deep-link."""
    otp = _generate_otp()
    cache.set(f'email_verify_{user_id}', otp, timeout=86400)  # 24h

    subject = "SmartSchool — Code de vérification de votre email"
    html_message = f"""
    <h2>Bonjour {prenom},</h2>
    <p>Bienvenue sur SmartSchool ! Voici votre code de vérification :</p>
    <h1 style="font-size:48px;letter-spacing:12px;color:#4F46E5;">{otp}</h1>
    <p>Saisissez-le dans l'application. Ce code expire dans <strong>24 heures</strong>.</p>
    <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
    """
    text_message = f"Votre code de vérification SmartSchool : {otp} (valable 24h)"

    try:
        send_mail(
            subject,
            text_message,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            html_message=html_message,
            fail_silently=False,
        )
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_otp(self, email: str):
    """Envoie un OTP à 6 chiffres valide 10 minutes pour réinitialiser le mot de passe."""
    otp = _generate_otp()
    cache.set(f'otp_reset_{email}', otp, timeout=600)  # 10 min

    subject = "EduTrack — Code de réinitialisation"
    html_message = f"""
    <h2>Réinitialisation de mot de passe</h2>
    <p>Votre code de vérification est :</p>
    <h1 style="font-size:48px;letter-spacing:12px;color:#6C63FF;">{otp}</h1>
    <p>Ce code expire dans <strong>10 minutes</strong>.</p>
    <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
    """
    text_message = f"Votre code de réinitialisation EduTrack : {otp} (valable 10 minutes)"

    try:
        send_mail(
            subject,
            text_message,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            html_message=html_message,
            fail_silently=False,
        )
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task
def send_parent_link_notification(eleve_email: str, eleve_prenom: str, parent_prenom: str, parent_nom: str):
    """Notifie l'élève qu'un parent vient d'établir un lien de suivi."""
    subject = "EduTrack — Un parent a rejoint votre suivi"
    html_message = f"""
    <h2>Bonjour {eleve_prenom},</h2>
    <p><strong>{parent_prenom} {parent_nom}</strong> a établi un lien de suivi avec votre compte EduTrack.</p>
    <p>Ils peuvent désormais consulter votre progression et recevoir vos rapports de performance.</p>
    <p>Si vous pensez que c'est une erreur, connectez-vous à EduTrack pour gérer vos liens parentaux.</p>
    """
    text_message = f"{parent_prenom} {parent_nom} suit maintenant votre progression sur EduTrack."

    send_mail(
        subject,
        text_message,
        settings.DEFAULT_FROM_EMAIL,
        [eleve_email],
        html_message=html_message,
        fail_silently=True,
    )


# ─── Tâches périodiques (Celery Beat) ─────────────────────────────────────────

@shared_task
def rappeler_sessions_du_jour():
    """Notifie chaque élève des sessions d'étude planifiées aujourd'hui (EF-09)."""
    from school.models import SessionsEtude
    from school.utils import notify_user

    now = timezone.now()
    debut = now
    fin = now + datetime.timedelta(hours=24)
    sessions = SessionsEtude.objects.filter(
        date_heure__range=(debut, fin), completee=False, rappel_envoye=False,
        id_planning__actif=True,
    ).select_related('id_matiere', 'id_planning__id_eleve')

    envoyes = 0
    for session in sessions:
        eleve = session.id_planning.id_eleve
        heure = timezone.localtime(session.date_heure).strftime('%H:%M')
        notify_user(
            eleve,
            titre="Rappel : session d'étude aujourd'hui",
            message=f"{session.id_matiere.nom} à {heure} ({session.duree_minutes} min). Prêt ?",
            type_notif="rappel",
        )
        session.rappel_envoye = True
        session.save(update_fields=['rappel_envoye'])
        envoyes += 1
    return f"{envoyes} rappel(s) de session envoyé(s)."


@shared_task
def alerter_inactivite():
    """Alerte les parents si un élève n'a pas travaillé depuis son seuil (EF-10)."""
    from school.models import Eleves, EleveParent, SessionsExamen, SessionsFocus
    from school.utils import notify_user

    now = timezone.now()
    alertes = 0
    for eleve in Eleves.objects.all():
        derniere_exam = SessionsExamen.objects.filter(
            id_eleve=eleve).order_by('-date_debut').values_list('date_debut', flat=True).first()
        derniere_focus = SessionsFocus.objects.filter(
            id_eleve=eleve).order_by('-date_debut').values_list('date_debut', flat=True).first()
        dates = [d for d in (derniere_exam, derniere_focus) if d]
        if not dates:
            continue
        jours_inactif = (now - max(dates)).days

        for lien in EleveParent.objects.filter(id_eleve=eleve, actif=True).select_related('id_parent'):
            seuil = lien.id_parent.seuil_alerte_jours or 3
            if jours_inactif >= seuil:
                notify_user(
                    lien.id_parent,
                    titre="Alerte : inactivité de votre enfant",
                    message=(
                        f"{eleve.prenom} n'a pas travaillé depuis {jours_inactif} jours. "
                        "Un petit encouragement pourrait aider !"
                    ),
                    type_notif="alerte",
                )
                alertes += 1
    return f"{alertes} alerte(s) d'inactivité envoyée(s)."


@shared_task
def envoyer_revisions_quotidiennes():
    """Génère la révision du jour (IA) de chaque élève et envoie un rappel push.

    Style Duolingo : un seul nudge par élève et par jour (anti-spam), tant que
    la révision n'est pas déjà complétée.
    """
    from school.models import Eleves
    from school.api_views.revision_views import generer_revision_du_jour
    from school.utils import notify_user

    jour = timezone.localdate()
    envoyes = 0
    for eleve in Eleves.objects.all():
        revision = generer_revision_du_jour(eleve, jour)
        if revision.completee or revision.rappel_envoye or revision.id_epreuve is None:
            continue
        notify_user(
            eleve,
            titre="Ta révision du jour t'attend !",
            message=(
                f"{revision.id_epreuve.nb_questions} questions rapides pour entretenir "
                "ta série. Ça ne prend que 3 minutes 🔥"
            ),
            type_notif="rappel",
            data={"type": "revision", "id_epreuve": str(revision.id_epreuve.id_epreuve)},
        )
        revision.rappel_envoye = True
        revision.save(update_fields=['rappel_envoye'])
        envoyes += 1
    return f"{envoyes} rappel(s) de révision envoyé(s)."


@shared_task
def relancer_serie_en_peril():
    """Nudge du soir (style Duolingo) : relance les élèves SANS activité aujourd'hui
    pour sauver leur série. Plus insistant que le rappel du matin. Un seul par jour."""
    from school.models import Eleves, SessionsExamen, SessionsFocus, Notifications
    from school.utils import notify_user

    today = timezone.localdate()
    envoyes = 0
    for eleve in Eleves.objects.all():
        actif_aujourdhui = (
            SessionsExamen.objects.filter(id_eleve=eleve, date_debut__date=today).exists()
            or SessionsFocus.objects.filter(id_eleve=eleve, date_debut__date=today).exists()
        )
        if actif_aujourdhui:
            continue
        deja = Notifications.objects.filter(
            id_utilisateur=eleve, type_notif='rappel',
            titre__icontains='série', date_envoi__date=today,
        ).exists()
        if deja:
            continue
        if eleve.streak_jours and eleve.streak_jours > 0:
            titre = f"🔥 Ta série de {eleve.streak_jours} jours va sauter !"
            message = "Tu n'as pas encore étudié aujourd'hui. 5 minutes suffisent pour la sauver."
        else:
            titre = "🔥 Reprends ta série aujourd'hui"
            message = "Une petite session maintenant et tu repars du bon pied. On y va ?"
        notify_user(eleve, titre=titre, message=message, type_notif='rappel', data={"type": "streak"})
        envoyes += 1
    return f"{envoyes} relance(s) de série envoyée(s)."


@shared_task
def coacher_eleves():
    """Envoie un message de coaching personnalisé quotidien à chaque élève (Module 10).

    Un seul message « coach » par élève et par jour (anti-spam). Le message est
    généré par l'IA, avec fallback règles si l'IA est indisponible.
    """
    from school.models import Eleves, Notifications
    from school.api_views.coach_views import generer_conseil_coach
    from school.utils import notify_user

    today = timezone.now().date()
    envoyes = 0
    for eleve in Eleves.objects.all():
        deja = Notifications.objects.filter(
            id_utilisateur=eleve, type_notif='coach', date_envoi__date=today,
        ).exists()
        if deja:
            continue
        titre, message, _source, _ctx = generer_conseil_coach(eleve)
        notify_user(eleve, titre=titre, message=message, type_notif='coach')
        envoyes += 1
    return f"{envoyes} message(s) de coaching envoyé(s)."


@shared_task
def generer_rapports_hebdomadaires():
    """Génère et envoie le rapport hebdomadaire pour chaque lien parent-élève (EF-10)."""
    from school.models import EleveParent, RapportsParentaux
    from school.api_views.parent_views import construire_stats_rapport
    from school.utils import notify_user

    now = timezone.now().date()
    debut = now - datetime.timedelta(days=7)
    generes = 0
    for lien in EleveParent.objects.filter(actif=True).select_related('id_parent', 'id_eleve'):
        parent, eleve = lien.id_parent, lien.id_eleve
        if RapportsParentaux.objects.filter(
            id_parent=parent, id_eleve=eleve, periode_fin=now).exists():
            continue
        stats = construire_stats_rapport(eleve, debut, now)
        RapportsParentaux.objects.create(
            id_parent=parent, id_eleve=eleve,
            periode_debut=debut, periode_fin=now,
            moyenne_globale=stats['moyenne_globale'],
            temps_etude_total=stats['temps_etude_total'],
            nb_sessions=stats['nb_sessions'],
            matieres_travaillees=stats['matieres_travaillees'],
            lacunes_principales=stats['lacunes_principales'],
            envoye=True,
        )
        notify_user(
            parent,
            titre="Nouveau rapport hebdomadaire disponible",
            message=f"Le rapport de {eleve.prenom} pour la semaine est prêt.",
            type_notif="rapport",
        )
        generes += 1
    return f"{generes} rapport(s) hebdomadaire(s) généré(s)."
