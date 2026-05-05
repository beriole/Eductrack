from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter
from school.models import Matieres
from school.serializers import MatiereSerializer

class MatiereListView(generics.ListAPIView):
    queryset = Matieres.objects.filter(actif=True)
    serializer_class = MatiereSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['niveaux', 'series']
    search_fields = ['nom', 'code']

    @method_decorator(cache_page(60 * 60)) # Cache for 1 hour
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)
