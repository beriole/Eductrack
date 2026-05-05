import threading
from django.core.mail import send_mail
from django.conf import settings

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
            fail_silently=False,
            html_message=self.html_message
        )

def send_email_async(subject, message, recipient_list, from_email=None, html_message=None):
    """
    Simule le comportement asynchrone de NodeMailer en Python via des Threads.
    Permet d'envoyer un email sans bloquer l'exécution de la requête.
    """
    EmailThread(subject, message, recipient_list, from_email, html_message).start()
