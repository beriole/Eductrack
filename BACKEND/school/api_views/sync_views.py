from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from datetime import datetime
from school.models import Matieres, Cours, Epreuves
from school.serializers import MatiereSerializer, CoursSerializer, EpreuveSerializer
from django.utils.dateparse import parse_datetime

class SyncView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        since_param = request.query_params.get('since')
        if not since_param:
            return Response({"error": "Le paramètre 'since' est requis (format ISO 8601)."}, status=400)
            
        since_date = parse_datetime(since_param)
        if not since_date:
            return Response({"error": "Format de date invalide."}, status=400)

        # Matieres (no modification date in model, returning all active for now)
        matieres = Matieres.objects.filter(actif=True)
        
        # Cours (assuming we only sync published courses for students)
        cours = Cours.objects.filter(statut='publie', date_publication__gte=since_date)
        
        # Epreuves
        epreuves = Epreuves.objects.filter(statut='actif', date_ajout__gte=since_date)

        return Response({
            "timestamp_sync": datetime.now().isoformat(),
            "matieres": MatiereSerializer(matieres, many=True).data,
            "cours": CoursSerializer(cours, many=True).data,
            "epreuves": EpreuveSerializer(epreuves, many=True).data
        })
