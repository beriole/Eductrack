import logging
import requests
from django.conf import settings
from django.utils import timezone
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from school.models import Abonnements, Paiements, Utilisateur
from school.serializers import AbonnementSerializer, PaiementSerializer
import datetime
import uuid

logger = logging.getLogger(__name__)

FORMULE_PRIX = {
    'basic':    {'mensuel': 0,      'trimestriel': 0,      'annuel': 0},
    'standard': {'mensuel': 2500,   'trimestriel': 6500,   'annuel': 24000},
    'premium':  {'mensuel': 5000,   'trimestriel': 13000,  'annuel': 48000},
    'pro':      {'mensuel': 10000,  'trimestriel': 26000,  'annuel': 96000},
}


def _fapshi_headers():
    return {
        'apiuser': settings.FAPSHI_API_USER,
        'apikey': settings.FAPSHI_API_KEY,
        'Content-Type': 'application/json',
    }


def _initiate_fapshi_payment(amount: int, phone: str, description: str, redirect_url: str = '') -> dict:
    payload = {
        'amount': amount,
        'phone': phone,
        'message': description,
        'redirectUrl': redirect_url or settings.FRONTEND_URL,
    }
    resp = requests.post(
        f"{settings.FAPSHI_BASE_URL}/initiatepayment",
        json=payload,
        headers=_fapshi_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _check_fapshi_status(trans_id: str) -> dict:
    resp = requests.get(
        f"{settings.FAPSHI_BASE_URL}/paymentstatus/{trans_id}",
        headers=_fapshi_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


class PaiementInitierView(APIView):
    """Initie un paiement Fapshi (MTN MoMo / Orange Money) pour un abonnement."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        formule = request.data.get('formule', 'standard')
        periodicite = request.data.get('periodicite', 'mensuel')
        phone = request.data.get('phone', '').strip()

        if not phone:
            return Response({"error": "Le numéro de téléphone est requis."}, status=status.HTTP_400_BAD_REQUEST)

        if formule not in FORMULE_PRIX:
            return Response({"error": "Formule invalide."}, status=status.HTTP_400_BAD_REQUEST)

        if periodicite not in ('mensuel', 'trimestriel', 'annuel'):
            return Response({"error": "Périodicité invalide."}, status=status.HTTP_400_BAD_REQUEST)

        montant = FORMULE_PRIX[formule][periodicite]
        if montant == 0:
            return Response({"error": "La formule Basic est gratuite, aucun paiement requis."}, status=status.HTTP_400_BAD_REQUEST)

        reference = f"EDU-{uuid.uuid4().hex[:12].upper()}"
        description = f"SmartSchool — Abonnement {formule.capitalize()} ({periodicite})"

        fapshi_mode = getattr(settings, 'FAPSHI_API_USER', '') != ''
        if not fapshi_mode:
            # Mode test : simuler une transaction
            return Response({
                "trans_id": f"TEST-{reference}",
                "link": "https://example.com/pay",
                "montant": montant,
                "reference": reference,
                "message": "Mode test activé — aucun paiement réel.",
            }, status=status.HTTP_200_OK)

        try:
            result = _initiate_fapshi_payment(montant, phone, description)
        except requests.RequestException as exc:
            logger.error("Fapshi initiation error: %s", exc)
            return Response({"error": "Erreur de connexion au service de paiement."}, status=status.HTTP_502_BAD_GATEWAY)

        # Enregistrer le paiement en attente
        now = timezone.now().date()
        durees = {'mensuel': 30, 'trimestriel': 90, 'annuel': 365}
        expiration = now + datetime.timedelta(days=durees[periodicite])

        abonnement = Abonnements.objects.create(
            id_utilisateur=request.user,
            formule=formule,
            montant=montant,
            periodicite=periodicite,
            date_debut=now,
            date_expiration=expiration,
            statut='suspendu',
        )

        Paiements.objects.create(
            id_abonnement=abonnement,
            id_utilisateur=request.user,
            montant=montant,
            methode_paiement='mtn_momo',
            reference_transaction=result.get('transId', reference),
            statut='en_attente',
            metadata={'fapshi': result, 'formule': formule, 'periodicite': periodicite},
        )

        return Response({
            "trans_id": result.get('transId'),
            "link": result.get('link'),
            "montant": montant,
            "reference": reference,
        }, status=status.HTTP_200_OK)


class PaiementStatutView(APIView):
    """Vérifie le statut d'un paiement Fapshi et active l'abonnement si confirmé."""
    permission_classes = [IsAuthenticated]

    def get(self, request, trans_id):
        try:
            paiement = Paiements.objects.select_related('id_abonnement').get(
                reference_transaction=trans_id,
                id_utilisateur=request.user,
            )
        except Paiements.DoesNotExist:
            return Response({"error": "Transaction introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if paiement.statut == 'confirme':
            return Response({"statut": "confirme", "abonnement": AbonnementSerializer(paiement.id_abonnement).data})

        try:
            result = _check_fapshi_status(trans_id)
        except requests.RequestException as exc:
            logger.error("Fapshi status error: %s", exc)
            return Response({"error": "Impossible de vérifier le statut."}, status=status.HTTP_502_BAD_GATEWAY)

        fapshi_status = result.get('status', '').lower()

        if fapshi_status in ('successful', 'success'):
            paiement.statut = 'confirme'
            paiement.date_confirmation = timezone.now()
            paiement.save(update_fields=['statut', 'date_confirmation'])

            abonnement = paiement.id_abonnement
            abonnement.statut = 'actif'
            abonnement.save(update_fields=['statut'])

            return Response({"statut": "confirme", "abonnement": AbonnementSerializer(abonnement).data})

        if fapshi_status in ('failed', 'expired'):
            paiement.statut = 'echoue'
            paiement.save(update_fields=['statut'])

        return Response({"statut": fapshi_status or "en_attente"})


class AbonnementListView(generics.ListAPIView):
    serializer_class = AbonnementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Abonnements.objects.filter(id_utilisateur=self.request.user).order_by('-date_creation')


class AbonnementActifView(APIView):
    """Retourne l'abonnement actif de l'utilisateur (ou None)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        abonnement = Abonnements.objects.filter(
            id_utilisateur=request.user,
            statut='actif',
            date_expiration__gte=timezone.now().date(),
        ).order_by('-date_expiration').first()

        if not abonnement:
            return Response({"abonnement": None, "formule": "basic"})

        return Response({"abonnement": AbonnementSerializer(abonnement).data, "formule": abonnement.formule})
