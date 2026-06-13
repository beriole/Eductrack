from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.db import models
from school.models import Epreuves, Questions, Eleves
from school.serializers import EpreuveSerializer, QuestionExamSerializer

class EpreuveListView(generics.ListAPIView):
    serializer_class = EpreuveSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['type_epreuve', 'serie', 'id_matiere', 'annee']

    def get_queryset(self):
        # Catalogue : on masque les épreuves générées à la volée par le système
        # (révision du jour, exercices IA ciblés, test d'orientation). Elles
        # portent source='custom' sans enseignant et restent jouables via leur
        # lien direct, mais n'ont rien à faire dans la liste publique.
        qs = Epreuves.objects.filter(statut='actif').exclude(
            models.Q(source='custom') & models.Q(id_enseignant__isnull=True)
        )
        user = self.request.user
        # Les élèves ne voient que les épreuves de leur classe (niveau + série).
        if user.role == 'eleve':
            eleve = Eleves.objects.filter(id_utilisateur=user.id_utilisateur).first()
            if eleve and eleve.niveau_scolaire:
                qs = qs.filter(niveau=eleve.niveau_scolaire)
                if eleve.serie:
                    qs = qs.filter(
                        models.Q(serie=eleve.serie)
                        | models.Q(serie__isnull=True)
                        | models.Q(serie='')
                    )
        return qs

class EpreuveDetailView(generics.RetrieveAPIView):
    queryset = Epreuves.objects.filter(statut='actif')
    serializer_class = EpreuveSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'id_epreuve'

class EpreuveQuestionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id_epreuve):
        try:
            epreuve = Epreuves.objects.get(id_epreuve=id_epreuve, statut='actif')
        except Epreuves.DoesNotExist:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)
        
        # Mode examen : on n'expose ni la réponse correcte ni l'explication.
        # La correction n'est révélée qu'après soumission, via /sessions/<id>/correction/.
        questions = Questions.objects.filter(id_epreuve=epreuve).order_by('numero_ordre')
        serializer = QuestionExamSerializer(questions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
