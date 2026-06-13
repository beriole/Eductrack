"""Préparation aux concours (EF-19).

Expose un catalogue des grands concours camerounais d'entrée aux écoles et
administrations, avec conditions d'accès et débouchés. Données curées côté
serveur pour rester disponibles hors-ligne (synchronisables).
"""
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

CONCOURS = [
    {
        'code': 'ENS',
        'nom': "ENS — École Normale Supérieure",
        'categorie': 'Enseignement',
        'etablissement': 'Université de Yaoundé I',
        'niveau_requis': 'BAC / Licence',
        'epreuves': ['Culture générale', 'Matière de spécialité', 'Dissertation'],
        'debouches': ["Professeur de l'enseignement secondaire (PLEG, PCEG)"],
        'periode': 'Juin — Août',
        'icone': '🎓',
    },
    {
        'code': 'ENAM',
        'nom': "ENAM — École Nationale d'Administration et de Magistrature",
        'categorie': 'Administration',
        'etablissement': 'Yaoundé',
        'niveau_requis': 'Licence (Bac+3)',
        'epreuves': ['Culture générale', 'Droit', 'Économie', 'Note de synthèse'],
        'debouches': ['Administrateur civil', 'Magistrat', 'Inspecteur des impôts', 'Douanier'],
        'periode': 'Septembre — Novembre',
        'icone': '⚖️',
    },
    {
        'code': 'IUT',
        'nom': 'IUT — Instituts Universitaires de Technologie',
        'categorie': 'Technologie',
        'etablissement': 'Douala, Ngaoundéré, Bandjoun',
        'niveau_requis': 'BAC scientifique / technique',
        'epreuves': ['Mathématiques', 'Sciences physiques', 'Logique'],
        'debouches': ['DUT Génie informatique', 'DUT Génie civil', 'DUT Maintenance'],
        'periode': 'Juillet — Septembre',
        'icone': '🔧',
    },
    {
        'code': 'ENSP',
        'nom': 'ENSP — École Nationale Supérieure Polytechnique',
        'categorie': 'Ingénierie',
        'etablissement': 'Yaoundé / Maroua',
        'niveau_requis': 'BAC C, D, E ou TI',
        'epreuves': ['Mathématiques', 'Physique', 'Chimie'],
        'debouches': ['Ingénieur génie civil', 'Ingénieur informatique', 'Ingénieur électrique'],
        'periode': 'Juillet — Août',
        'icone': '🏗️',
    },
    {
        'code': 'FMSB',
        'nom': 'FMSB — Faculté de Médecine et des Sciences Biomédicales',
        'categorie': 'Santé',
        'etablissement': 'Université de Yaoundé I',
        'niveau_requis': 'BAC C ou D',
        'epreuves': ['SVT', 'Physique-Chimie', 'Logique médicale'],
        'debouches': ['Médecin', 'Pharmacien', 'Chirurgien-dentiste'],
        'periode': 'Août — Octobre',
        'icone': '⚕️',
    },
    {
        'code': 'POLICE',
        'nom': 'Concours de la Police Nationale',
        'categorie': 'Sécurité',
        'etablissement': 'ENSP / Mutengene',
        'niveau_requis': 'BEPC à BAC selon le grade',
        'epreuves': ['Culture générale', 'Épreuve physique', 'Dictée'],
        'debouches': ['Gardien de la paix', 'Inspecteur de police', 'Commissaire'],
        'periode': 'Variable',
        'icone': '👮',
    },
]


class ConcoursListView(APIView):
    """Renvoie le catalogue des concours, filtrable par catégorie."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        categorie = request.query_params.get('categorie')
        data = CONCOURS
        if categorie:
            data = [c for c in CONCOURS if c['categorie'].lower() == categorie.lower()]
        categories = sorted({c['categorie'] for c in CONCOURS})
        return Response({'categories': categories, 'concours': data})
