"""Envoie une notification push de test à un utilisateur (par email).

Sert à vérifier la chaîne push de bout en bout une fois que l'app a enregistré
un token (au login). Affiche le token et le résultat de l'envoi.

    python manage.py test_push demo.eleve@edutrack.cm
    python manage.py test_push demo.eleve@edutrack.cm --titre "Coucou" --message "Au boulot !"
"""
from django.core.management.base import BaseCommand, CommandError

from school.models import Utilisateur
from school.utils import notify_user, send_push_notification


class Command(BaseCommand):
    help = "Envoie un push de test à un utilisateur (par email)."

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('--titre', default="EduTrack — Test 🔔")
        parser.add_argument('--message', default="Si tu vois ceci, le push fonctionne ! 🎉")

    def handle(self, *args, **options):
        try:
            user = Utilisateur.objects.get(email=options['email'])
        except Utilisateur.DoesNotExist:
            raise CommandError(f"Aucun utilisateur avec l'email {options['email']}.")

        token = getattr(user, 'push_token', None)
        token_txt = token or "(aucun : l'app doit se connecter au moins une fois)"
        self.stdout.write(f"Utilisateur : {user.prenom} {user.nom} ({user.role})")
        self.stdout.write(f"Token push  : {token_txt}")

        # Crée la notif en base (cloche) + envoie le push si token présent.
        notify_user(user, titre=options['titre'], message=options['message'], type_notif='rappel')

        if token:
            ok = send_push_notification(token, options['titre'], options['message'])
            style = self.style.SUCCESS if ok else self.style.ERROR
            self.stdout.write(style(f"Push envoyé : {'OK' if ok else 'ÉCHEC'}"))
        else:
            self.stdout.write(self.style.WARNING("Pas de token : notif créée dans la cloche seulement."))
