from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from school.models import Eleves, Diagnostics, Lacunes, Matieres, Cours, SessionsExamen, EleveBadges
from school.serializers import DiagnosticSerializer, LacuneSerializer, CoursSerializer, SessionExamenSerializer, EleveBadgeSerializer

class DiagnosticListView(generics.ListCreateAPIView):
    serializer_class = DiagnosticSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return Diagnostics.objects.none()
        return Diagnostics.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != 'eleve':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Seuls les élèves peuvent soumettre un diagnostic.")
            
        eleve = Eleves.objects.get(id_utilisateur=user.id_utilisateur)
        diagnostic = serializer.save(id_eleve=eleve)

        # Mettre à jour la date_diagnostic de l'élève
        eleve.date_diagnostic = timezone.now().date()
        eleve.save(update_fields=['date_diagnostic'])

        # Création automatique des lacunes si fournies dans la requête sous forme brute
        # Note : On suppose ici que le front peut envoyer "lacunes_data" dans la requête.
        lacunes_data = self.request.data.get('lacunes_data', [])
        nb_lacunes = 0
        for ld in lacunes_data:
            try:
                matiere = Matieres.objects.get(code=ld.get('matiere_code'))
                Lacunes.objects.create(
                    id_eleve=eleve,
                    id_matiere=matiere,
                    id_diagnostic=diagnostic,
                    chapitre=ld.get('chapitre', 'Général'),
                    notion=ld.get('notion', 'Inconnu'),
                    taux_maitrise=ld.get('taux_maitrise', 0)
                )
                nb_lacunes += 1
            except Matieres.DoesNotExist:
                continue

        # Parcours de remédiation : on enregistre le bilan sur le diagnostic et
        # on notifie l'élève des notions prioritaires à retravailler (EF-03).
        diagnostic.nb_lacunes_detectees = nb_lacunes
        diagnostic.parcours_genere = True
        diagnostic.save(update_fields=['nb_lacunes_detectees', 'parcours_genere'])

        if nb_lacunes:
            from school.utils import notify_user
            notify_user(
                eleve,
                titre="Ton parcours de remédiation est prêt",
                message=(
                    f"{nb_lacunes} notion(s) à renforcer ont été détectées. "
                    "Crée ton planning d'étude pour les travailler en priorité."
                ),
                type_notif="alerte",
            )

class LacuneListView(generics.ListAPIView):
    serializer_class = LacuneSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return Lacunes.objects.none()
        
        queryset = Lacunes.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)
        statut = self.request.query_params.get('statut')
        if statut:
            queryset = queryset.filter(statut=statut)
        return queryset

class LacuneDetecterView(APIView):
    """POST /analytique/lacunes/detecter/ — relance la détection transversale.

    Recalcule la maîtrise de l'élève connecté sur l'ensemble de ses résultats
    et renvoie le récapitulatif + la liste des lacunes à jour.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil introuvable."}, status=status.HTTP_404_NOT_FOUND)

        from school.lacune_engine import detecter_lacunes_transversales
        recap = detecter_lacunes_transversales(eleve)
        lacunes = Lacunes.objects.filter(id_eleve=eleve).order_by('taux_maitrise')
        return Response(
            {"recap": recap, "lacunes": LacuneSerializer(lacunes, many=True).data},
            status=status.HTTP_200_OK,
        )


class LacuneDetailView(generics.UpdateAPIView):
    serializer_class = LacuneSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'id_lacune'

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return Lacunes.objects.none()
        return Lacunes.objects.filter(id_eleve__id_utilisateur=self.request.user.id_utilisateur)

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Dernier diagnostic
        dernier_diag = Diagnostics.objects.filter(id_eleve=eleve).order_by('-date_passage').first()
        
        # Lacunes non maîtrisées (Top 3)
        lacunes_actives = Lacunes.objects.filter(id_eleve=eleve).exclude(statut='maitrisee').order_by('taux_maitrise')[:3]

        # Cours récents publiés de la classe de l'élève (5 derniers)
        cours_qs = Cours.objects.filter(statut='publie')
        if eleve.niveau_scolaire:
            cours_qs = cours_qs.filter(niveau=eleve.niveau_scolaire)
        cours_recents = cours_qs.order_by('-date_publication')[:5]

        # Sessions récentes de l'élève (3 dernières)
        sessions_recentes = SessionsExamen.objects.filter(
            id_eleve=eleve, statut='termine'
        ).order_by('-date_fin')[:3]

        # Badges récents (3 derniers)
        badges_recents = EleveBadges.objects.filter(id_eleve=eleve).order_by('-date_obtention')[:3]

        # Taux de réussite global
        total_sessions = SessionsExamen.objects.filter(id_eleve=eleve, statut='termine').count()
        sessions_reussies = SessionsExamen.objects.filter(
            id_eleve=eleve, statut='termine', note_obtenue__gte=10
        ).count()
        taux_reussite = round((sessions_reussies / total_sessions) * 100) if total_sessions else 0

        return Response({
            "stats_globales": {
                "points_gamification": eleve.points_gamification,
                "streak_jours": eleve.streak_jours,
                "score_global": eleve.score_global,
                "total_sessions": total_sessions,
                "taux_reussite": taux_reussite,
            },
            "dernier_diagnostic": DiagnosticSerializer(dernier_diag).data if dernier_diag else None,
            "lacunes_actives": LacuneSerializer(lacunes_actives, many=True).data,
            "cours_recents": CoursSerializer(cours_recents, many=True).data,
            "sessions_recentes": SessionExamenSerializer(sessions_recentes, many=True).data,
            "badges_recents": EleveBadgeSerializer(badges_recents, many=True).data,
        }, status=status.HTTP_200_OK)
