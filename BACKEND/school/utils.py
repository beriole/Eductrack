import threading
import logging
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


# ─── Email async ──────────────────────────────────────────────────────────────

class EmailThread(threading.Thread):
    def __init__(self, subject, message, recipient_list, from_email=None, html_message=None):
        self.subject = subject
        self.message = message
        self.recipient_list = recipient_list
        self.from_email = from_email or settings.DEFAULT_FROM_EMAIL
        self.html_message = html_message
        threading.Thread.__init__(self)

    def run(self):
        send_mail(
            self.subject,
            self.message,
            self.from_email,
            self.recipient_list,
            fail_silently=True,
            html_message=self.html_message,
        )


def send_email_async(subject, message, recipient_list, from_email=None, html_message=None):
    EmailThread(subject, message, recipient_list, from_email, html_message).start()


# ─── Push Notifications ───────────────────────────────────────────────────────

def _send_via_expo(token: str, title: str, body: str, data: dict = None) -> bool:
    """Envoie via le service Expo (fonctionne avec Expo Go sans EAS)."""
    import requests as req
    payload = {
        "to": token, "title": title, "body": body, "sound": "default",
        "priority": "high", "channelId": "default",
    }
    if data:
        payload["data"] = data
    try:
        r = req.post(
            "https://exp.host/--/api/v2/push/send",
            json=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=10,
        )
        return r.status_code == 200
    except Exception as exc:
        logger.debug("Expo push failed: %s", exc)
        return False


def _send_via_fcm(token: str, title: str, body: str, data: dict = None) -> bool:
    """Envoie via Firebase Cloud Messaging (Admin SDK)."""
    try:
        from firebase_admin import messaging
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            token=token,
            data={str(k): str(v) for k, v in (data or {}).items()},
        )
        messaging.send(message)
        return True
    except Exception as exc:
        logger.debug("FCM push failed: %s", exc)
        return False


def send_push_notification(push_token: str, title: str, body: str, data: dict = None) -> bool:
    """
    Envoie une notification push.
    - Tokens Expo (ExponentPushToken[...]) → Expo push service
    - Tokens FCM classiques → Firebase Admin SDK
    """
    if not push_token:
        return False
    if push_token.startswith("ExponentPushToken"):
        return _send_via_expo(push_token, title, body, data)
    return _send_via_fcm(push_token, title, body, data)


def notify_user(user, titre: str, message: str, type_notif: str = "rappel", data: dict = None):
    """
    Crée une notification en base ET envoie le push si l'utilisateur a un token.
    À utiliser partout dans le backend pour notifier un utilisateur.
    """
    from school.models import Notifications
    notif = Notifications.objects.create(
        id_utilisateur=user,
        type_notif=type_notif,
        titre=titre,
        message=message,
        canal="push",
    )
    if getattr(user, "push_token", None):
        send_push_notification(user.push_token, titre, message, data)
    return notif


def notifier_eleves_nouveau_contenu(obj, kind: str) -> int:
    """Notifie tous les élèves d'un niveau (et série compatible) qu'un nouveau
    contenu (cours / sujet / annale / exercice) vient d'être publié.

    `kind` = 'cours' ou 'epreuve'. Renvoie le nombre d'élèves notifiés.
    Crée les notifications en base (affichées dans la cloche) et envoie le push
    aux élèves disposant d'un token.
    """
    from django.db.models import Q
    from school.models import Eleves, Notifications

    niveau = obj.niveau
    serie = getattr(obj, 'serie', None)
    matiere = obj.id_matiere.nom

    eleves = Eleves.objects.filter(niveau_scolaire=niveau)
    if serie:
        # Un contenu d'une série précise ne concerne que cette série ;
        # un contenu sans série (tronc commun) concerne tout le niveau.
        eleves = eleves.filter(Q(serie=serie) | Q(serie__isnull=True) | Q(serie=''))
    eleves = list(eleves)
    if not eleves:
        return 0

    if kind == 'cours':
        titre = f"Nouveau cours en {matiere}"
        message = f"« {obj.titre} » vient d'être publié. Va le consulter dès maintenant !"
        data = {"type": "cours", "id": str(obj.pk)}
    else:
        libelle = {'officielle': 'annale', 'simulation': 'sujet', 'exercice': 'exercice'}.get(obj.type_epreuve, 'sujet')
        titre = f"Nouvel {libelle} en {matiere}" if libelle == 'exercice' else f"Nouvelle {libelle} en {matiere}" if libelle == 'annale' else f"Nouveau {libelle} en {matiere}"
        message = f"« {obj.titre} » est disponible. Prêt à t'entraîner ?"
        data = {"type": "epreuve", "id": str(obj.pk)}

    Notifications.objects.bulk_create([
        Notifications(id_utilisateur=e, type_notif='nouveau_contenu',
                      titre=titre, message=message, canal='push')
        for e in eleves
    ])
    for e in eleves:
        token = getattr(e, 'push_token', None)
        if token:
            send_push_notification(token, titre, message, data)
    return len(eleves)
