import django_filters
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter
from school.models import Matieres
from school.serializers import MatiereSerializer


class MatiereFilter(django_filters.FilterSet):
    """Filtre par appartenance dans les listes JSON `niveaux` / `series`.

    `niveaux` et `series` sont des JSONField : django-filter ne peut pas les
    auto-générer. On expose des filtres explicites `?niveau=Tle` / `?serie=C`."""
    niveau = django_filters.CharFilter(method='filter_niveau')
    serie = django_filters.CharFilter(method='filter_serie')

    class Meta:
        model = Matieres
        fields = []

    def filter_niveau(self, queryset, name, value):
        return queryset.filter(niveaux__contains=[value])

    def filter_serie(self, queryset, name, value):
        return queryset.filter(series__contains=[value])


class MatiereListView(generics.ListAPIView):
    queryset = Matieres.objects.filter(actif=True).order_by('nom')
    serializer_class = MatiereSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = MatiereFilter
    search_fields = ['nom', 'code']
    # Le catalogue des matières est un petit ensemble borné (~30 entrées).
    # On désactive la pagination : sinon les formulaires d'ajout de contenu ne
    # reçoivent que les 20 premières matières (PAGE_SIZE) et il en manque.
    pagination_class = None

    @method_decorator(cache_page(60 * 60))  # Cache 1 heure
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)
