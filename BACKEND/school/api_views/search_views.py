"""Recherche globale : cours, épreuves et matières en une requête.

Respecte le périmètre de l'élève (niveau + série) comme les listes dédiées :
un élève ne trouve que le contenu de sa classe.
"""
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from school.models import Cours, Epreuves, Matieres, Eleves

LIMITE = 8


class RechercheGlobaleView(APIView):
    """GET /recherche/?q=<terme> — résultats groupés (matières, cours, examens)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response({'q': q, 'matieres': [], 'cours': [], 'epreuves': []})

        user = request.user
        eleve = Eleves.objects.filter(id_utilisateur=user.id_utilisateur).first() if user.role == 'eleve' else None

        # Cours
        cours_qs = Cours.objects.filter(statut='publie').select_related('id_matiere')
        epr_qs = Epreuves.objects.filter(statut='actif').select_related('id_matiere').exclude(
            Q(source='custom') & Q(id_enseignant__isnull=True))
        if eleve and eleve.niveau_scolaire:
            cours_qs = cours_qs.filter(niveau=eleve.niveau_scolaire)
            epr_qs = epr_qs.filter(niveau=eleve.niveau_scolaire)
            if eleve.serie:
                serie_f = Q(serie=eleve.serie) | Q(serie__isnull=True) | Q(serie='')
                cours_qs = cours_qs.filter(serie_f)
                epr_qs = epr_qs.filter(serie_f)

        cours_qs = cours_qs.filter(Q(titre__icontains=q) | Q(id_matiere__nom__icontains=q))[:LIMITE]
        epr_qs = epr_qs.filter(Q(titre__icontains=q) | Q(id_matiere__nom__icontains=q))[:LIMITE]
        mat_qs = Matieres.objects.filter(actif=True).filter(
            Q(nom__icontains=q) | Q(code__icontains=q))[:LIMITE]

        return Response({
            'q': q,
            'matieres': [{'id_matiere': str(m.id_matiere), 'nom': m.nom, 'code': m.code} for m in mat_qs],
            'cours': [{
                'id_cours': str(c.id_cours), 'titre': c.titre,
                'matiere_nom': c.id_matiere.nom if c.id_matiere else '',
                'matiere_code': c.id_matiere.code if c.id_matiere else '',
                'niveau': c.niveau,
            } for c in cours_qs],
            'epreuves': [{
                'id_epreuve': str(e.id_epreuve), 'titre': e.titre, 'type_epreuve': e.type_epreuve,
                'matiere_nom': e.id_matiere.nom if e.id_matiere else '',
                'matiere_code': e.id_matiere.code if e.id_matiere else '',
                'niveau': e.niveau, 'duree_minutes': e.duree_minutes,
            } for e in epr_qs],
        })
