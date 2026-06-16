"""Données de démonstration finances : abonnements + paiements.

Peuple l'onglet Finances et les KPIs revenus du back-office admin avec des
abonnements (formules basic→pro) et des paiements MTN MoMo / Orange Money / carte,
répartis sur les 6 dernières semaines pour alimenter le graphe des revenus.

Usage : python manage.py seed_finance
"""
import datetime
import random
import uuid

from django.core.management.base import BaseCommand
from django.utils import timezone

from school.models import Utilisateur, Abonnements, Paiements

# (formule, montant mensuel FCFA)
FORMULES = [('basic', 1000), ('standard', 2500), ('premium', 5000), ('pro', 9000)]
METHODES = ['mtn_momo', 'orange_money', 'carte']
MULT = {'mensuel': 1, 'trimestriel': 3, 'annuel': 12}


class Command(BaseCommand):
    help = "Seed de démonstration : abonnements + paiements (finances)."

    def handle(self, *args, **options):
        random.seed(42)
        # Repart de zéro (données de démo uniquement).
        Paiements.objects.all().delete()
        Abonnements.objects.all().delete()

        users = list(Utilisateur.objects.exclude(role='admin').order_by('?')[:18])
        if not users:
            self.stdout.write(self.style.WARNING("Aucun utilisateur — lance d'abord seed_demo."))
            return

        now = timezone.now()
        today = now.date()
        nb_abo = nb_paie = 0
        revenu = 0.0

        for i, u in enumerate(users):
            formule, mensuel = random.choice(FORMULES)
            periodicite = random.choice(list(MULT.keys()))
            montant = mensuel * MULT[periodicite]
            statut_abo = 'actif' if i % 6 else 'expire'
            debut = today - datetime.timedelta(days=random.randint(5, 120))
            expiration = debut + datetime.timedelta(days=30 * MULT[periodicite])

            abo = Abonnements.objects.create(
                id_utilisateur=u, formule=formule, montant=montant,
                periodicite=periodicite, date_debut=debut, date_expiration=expiration,
                statut=statut_abo, renouvellement_auto=True,
            )
            nb_abo += 1

            r = random.random()
            statut_p = 'confirme' if r < 0.75 else ('en_attente' if r < 0.9 else 'rembourse')
            methode = random.choice(METHODES)
            p = Paiements.objects.create(
                id_abonnement=abo, id_utilisateur=u, montant=montant,
                methode_paiement=methode, operateur=methode,
                reference_transaction=f"TX-{uuid.uuid4().hex[:10].upper()}",
                statut=statut_p,
            )
            # date_paiement a auto_now_add=True → on contourne via update() pour
            # répartir les paiements sur 6 semaines (graphe des revenus).
            dt = now - datetime.timedelta(days=random.randint(0, 42), hours=random.randint(0, 23))
            fields = {'date_paiement': dt}
            if statut_p == 'confirme':
                fields['date_confirmation'] = dt
                revenu += float(montant)
            Paiements.objects.filter(pk=p.pk).update(**fields)
            nb_paie += 1

        self.stdout.write(self.style.SUCCESS(
            f"{nb_abo} abonnements, {nb_paie} paiements crees - "
            f"revenu confirme ~ {revenu:.0f} FCFA"
        ))
