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


def _direct_pay(amount: int, phone: str, description: str, user, external_id: str = '') -> dict:
    """Paiement DIRECT Fapshi : l'invite MoMo/Orange Money est poussée
    directement sur le téléphone de l'utilisateur (aucune page web)."""
    nom = f"{user.prenom} {user.nom}".strip() or user.email
    payload = {
        'amount': int(amount),
        'phone': phone,
        'name': nom,
        'email': user.email,
        'userId': str(user.id_utilisateur),
        'externalId': external_id,
        'message': description,
    }
    resp = requests.post(
        f"{settings.FAPSHI_BASE_URL}/direct-pay",
        json=payload,
        headers=_fapshi_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _check_fapshi_status(trans_id: str) -> dict:
    resp = requests.get(
        f"{settings.FAPSHI_BASE_URL}/payment-status/{trans_id}",
        headers=_fapshi_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def _activer_abonnement(paiement):
    """Confirme un paiement et active l'abonnement lié (sans intervention admin)."""
    paiement.statut = 'confirme'
    paiement.date_confirmation = timezone.now()
    paiement.save(update_fields=['statut', 'date_confirmation'])
    abonnement = paiement.id_abonnement
    abonnement.statut = 'actif'
    abonnement.save(update_fields=['statut'])
    return abonnement


def _appliquer_statut_fapshi(paiement, fapshi_status):
    """Applique le statut Fapshi au paiement. Renvoie le statut normalisé."""
    st = (fapshi_status or '').lower()
    if st in ('successful', 'success') and paiement.statut != 'confirme':
        _activer_abonnement(paiement)
        return 'confirme'
    if st in ('failed', 'expired') and paiement.statut == 'en_attente':
        paiement.statut = 'echoue'
        paiement.save(update_fields=['statut'])
        return 'echoue'
    return paiement.statut


def _creer_abonnement_en_attente(user, formule, periodicite, montant, reference, meta):
    """Crée l'abonnement (suspendu) + le paiement (en attente) avant confirmation."""
    now = timezone.now().date()
    durees = {'mensuel': 30, 'trimestriel': 90, 'annuel': 365}
    abonnement = Abonnements.objects.create(
        id_utilisateur=user, formule=formule, montant=montant, periodicite=periodicite,
        date_debut=now, date_expiration=now + datetime.timedelta(days=durees[periodicite]),
        statut='suspendu',
    )
    paiement = Paiements.objects.create(
        id_abonnement=abonnement, id_utilisateur=user, montant=montant,
        methode_paiement='mtn_momo', reference_transaction=reference,
        statut='en_attente', metadata=meta,
    )
    return abonnement, paiement


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
            # Mode démo (aucune clé Fapshi) : on crée l'abonnement en attente avec
            # une référence TEST- ; il sera activé automatiquement à la vérification.
            ref = f"TEST-{reference}"
            _creer_abonnement_en_attente(
                request.user, formule, periodicite, montant, ref,
                {'demo': True, 'formule': formule, 'periodicite': periodicite})
            return Response({
                "trans_id": ref, "link": None, "montant": montant, "reference": reference,
                "message": "Mode démo — la vérification activera l'abonnement.",
            }, status=status.HTTP_200_OK)

        try:
            result = _direct_pay(montant, phone, description, request.user, reference)
        except requests.RequestException as exc:
            logger.error("Fapshi direct-pay error: %s", exc)
            return Response({"error": "Erreur de connexion au service de paiement."}, status=status.HTTP_502_BAD_GATEWAY)

        ref = result.get('transId', reference)
        _creer_abonnement_en_attente(
            request.user, formule, periodicite, montant, ref,
            {'fapshi': result, 'formule': formule, 'periodicite': periodicite})

        return Response({
            "trans_id": ref,
            "montant": montant,
            "reference": reference,
            "message": "Invite de paiement envoyée sur votre téléphone.",
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

        # Mode démo : référence TEST- → activation immédiate (aucun paiement réel).
        if trans_id.startswith('TEST-'):
            abonnement = _activer_abonnement(paiement)
            return Response({"statut": "confirme", "abonnement": AbonnementSerializer(abonnement).data})

        try:
            result = _check_fapshi_status(trans_id)
        except requests.RequestException as exc:
            logger.error("Fapshi status error: %s", exc)
            return Response({"error": "Impossible de vérifier le statut."}, status=status.HTTP_502_BAD_GATEWAY)

        statut = _appliquer_statut_fapshi(paiement, result.get('status', ''))
        if statut == 'confirme':
            return Response({"statut": "confirme", "abonnement": AbonnementSerializer(paiement.id_abonnement).data})
        return Response({"statut": statut or "en_attente"})


class FapshiWebhookView(APIView):
    """POST /paiements/webhook/fapshi/ — notification serveur de Fapshi.

    Active l'abonnement dès la confirmation, SANS validation administrateur.
    On revérifie systématiquement le statut auprès de Fapshi (on ne fait pas
    confiance au seul corps de la requête)."""
    permission_classes = [AllowAny]

    def post(self, request):
        trans_id = request.data.get('transId') or request.data.get('transactionId') or ''
        if not trans_id:
            return Response({"error": "transId manquant."}, status=status.HTTP_400_BAD_REQUEST)
        paiement = Paiements.objects.select_related('id_abonnement').filter(
            reference_transaction=trans_id).first()
        if not paiement:
            return Response({"message": "Inconnu, ignoré."}, status=status.HTTP_200_OK)
        if paiement.statut == 'confirme':
            return Response({"statut": "confirme"}, status=status.HTTP_200_OK)
        try:
            result = _check_fapshi_status(trans_id)
        except requests.RequestException:
            # On acquitte quand même : Fapshi réessaiera, ou le polling prendra le relais.
            return Response({"statut": "en_attente"}, status=status.HTTP_200_OK)
        statut = _appliquer_statut_fapshi(paiement, result.get('status', ''))
        return Response({"statut": statut}, status=status.HTTP_200_OK)


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
