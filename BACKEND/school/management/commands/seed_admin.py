"""Crée/met à jour le compte super-admin de la plateforme (role='admin').

Usage : python manage.py seed_admin
"""
from django.core.management.base import BaseCommand
from school.models import Utilisateur

ADMIN_EMAIL = 'admin@edutrack.cm'
ADMIN_PASSWORD = 'Admin1234!'


class Command(BaseCommand):
    help = "Crée le compte super-admin in-app (role='admin')."

    def handle(self, *args, **options):
        admin, created = Utilisateur.objects.get_or_create(
            email=ADMIN_EMAIL,
            defaults={
                'username': ADMIN_EMAIL, 'nom': 'Admin', 'prenom': 'SmartSchool',
                'role': 'admin', 'actif': True, 'email_verifie': True,
                'is_staff': True, 'is_superuser': True,
            },
        )
        # Toujours garantir l'état attendu, même si le compte existait déjà.
        admin.role = 'admin'
        admin.actif = True
        admin.email_verifie = True
        admin.is_staff = True
        admin.is_superuser = True
        admin.set_password(ADMIN_PASSWORD)
        admin.save()

        verbe = 'créé' if created else 'mis à jour'
        self.stdout.write(self.style.SUCCESS(
            f"Super-admin {verbe} : {ADMIN_EMAIL} / {ADMIN_PASSWORD} (role=admin)"
        ))
