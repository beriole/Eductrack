from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from school.models import Epreuves, Questions
from school.serializers import EpreuveSerializer, QuestionSerializer

class EpreuveListView(generics.ListAPIView):
    queryset = Epreuves.objects.filter(statut='publie')
    serializer_class = EpreuveSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['type_epreuve', 'serie', 'id_matiere', 'annee']

class EpreuveDetailView(generics.RetrieveAPIView):
    queryset = Epreuves.objects.filter(statut='publie')
    serializer_class = EpreuveSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'id_epreuve'

class EpreuveQuestionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id_epreuve):
        try:
            epreuve = Epreuves.objects.get(id_epreuve=id_epreuve, statut='publie')
        except Epreuves.DoesNotExist:
            return Response({"error": "Épreuve introuvable."}, status=status.HTTP_404_NOT_FOUND)
        
        # F2.3: La vision des questions est pour Standard+
        # Implémentation provisoire: accessible à tous jusqu'au Sprint 7 (Paiements)
        questions = Questions.objects.filter(id_epreuve=epreuve).order_by('numero_ordre')
        serializer = QuestionSerializer(questions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
