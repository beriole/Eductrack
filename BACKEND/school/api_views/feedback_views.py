"""Avis (notes + commentaires), favoris, et retours agrégés pour l'enseignant."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Avg, Count, Q

from school.models import Eleves, Enseignants, Cours, Epreuves, Avis, Favori
from school.serializers import AvisSerializer, FavoriSerializer


def _get_eleve(request):
    return Eleves.objects.filter(id_utilisateur=request.user.id_utilisateur).first()


def _resoudre_cible(data):
    """Renvoie (cours, epreuve, erreur). Exactement un des deux ids est requis."""
    id_cours = data.get('id_cours')
    id_epreuve = data.get('id_epreuve')
    if bool(id_cours) == bool(id_epreuve):
        return None, None, "Fournir exactement un id_cours OU un id_epreuve."
    cours = Cours.objects.filter(id_cours=id_cours).first() if id_cours else None
    epreuve = Epreuves.objects.filter(id_epreuve=id_epreuve).first() if id_epreuve else None
    if id_cours and not cours:
        return None, None, "Cours introuvable."
    if id_epreuve and not epreuve:
        return None, None, "Épreuve introuvable."
    return cours, epreuve, None


class AvisView(APIView):
    """GET ?id_cours=|?id_epreuve= : avis publics d'un contenu.
    POST {id_cours|id_epreuve, note, commentaire?} : crée/met à jour l'avis de l'élève."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cours, epreuve, err = _resoudre_cible(request.query_params)
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        qs = (Avis.objects.filter(id_cours=cours) if cours else Avis.objects.filter(id_epreuve=epreuve)).select_related('id_eleve')
        agg = qs.aggregate(moyenne=Avg('note'), nb=Count('id_avis'))
        return Response({
            'note_moyenne': round(agg['moyenne'], 1) if agg['moyenne'] is not None else None,
            'nb_avis': agg['nb'],
            'avis': AvisSerializer(qs[:50], many=True).data,
        })

    def post(self, request):
        eleve = _get_eleve(request)
        if not eleve:
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        cours, epreuve, err = _resoudre_cible(request.data)
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        try:
            note = int(request.data.get('note'))
        except (TypeError, ValueError):
            return Response({"error": "Note invalide."}, status=status.HTTP_400_BAD_REQUEST)
        if not (1 <= note <= 5):
            return Response({"error": "La note doit être comprise entre 1 et 5."}, status=status.HTTP_400_BAD_REQUEST)
        commentaire = (request.data.get('commentaire') or '').strip() or None
        avis, cree = Avis.objects.update_or_create(
            id_eleve=eleve, id_cours=cours, id_epreuve=epreuve,
            defaults={'note': note, 'commentaire': commentaire},
        )
        return Response(AvisSerializer(avis).data, status=status.HTTP_201_CREATED if cree else status.HTTP_200_OK)


class FavoriToggleView(APIView):
    """POST {id_cours|id_epreuve} : ajoute/retire le favori. Renvoie {est_favori}."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        eleve = _get_eleve(request)
        if not eleve:
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)
        cours, epreuve, err = _resoudre_cible(request.data)
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        existant = Favori.objects.filter(id_eleve=eleve, id_cours=cours, id_epreuve=epreuve).first()
        if existant:
            existant.delete()
            return Response({'est_favori': False}, status=status.HTTP_200_OK)
        Favori.objects.create(id_eleve=eleve, id_cours=cours, id_epreuve=epreuve)
        return Response({'est_favori': True}, status=status.HTTP_201_CREATED)


class FavorisListView(APIView):
    """GET : favoris de l'élève (cours + épreuves)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        eleve = _get_eleve(request)
        if not eleve:
            return Response([])
        qs = Favori.objects.filter(id_eleve=eleve).select_related(
            'id_cours__id_matiere', 'id_epreuve__id_matiere')
        return Response(FavoriSerializer(qs, many=True).data)


class EnseignantRetoursView(APIView):
    """GET : retours agrégés sur les contenus de l'enseignant (notes, avis, favoris)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ens = Enseignants.objects.filter(id_utilisateur=request.user.id_utilisateur).first()
        if not ens:
            return Response({"error": "Réservé aux enseignants."}, status=status.HTTP_403_FORBIDDEN)

        def agreger(qs, kind):
            qs = qs.annotate(moyenne=Avg('avis__note'),
                             nb=Count('avis', distinct=True),
                             favs=Count('favoris', distinct=True))
            return [{
                'id': str(o.pk), 'type': kind, 'titre': o.titre,
                'matiere_nom': o.id_matiere.nom,
                'note_moyenne': round(o.moyenne, 1) if o.moyenne is not None else None,
                'nb_avis': o.nb, 'nb_favoris': o.favs,
            } for o in qs.select_related('id_matiere')]

        contenus = (agreger(Cours.objects.filter(id_enseignant=ens), 'cours')
                    + agreger(Epreuves.objects.filter(id_enseignant=ens), 'epreuve'))
        contenus.sort(key=lambda c: (c['note_moyenne'] or 0, c['nb_avis']), reverse=True)

        commentaires = (Avis.objects
                        .filter(Q(id_cours__id_enseignant=ens) | Q(id_epreuve__id_enseignant=ens))
                        .exclude(commentaire__isnull=True).exclude(commentaire__exact='')
                        .select_related('id_eleve', 'id_cours', 'id_epreuve')[:20])

        notes = [c['note_moyenne'] for c in contenus if c['note_moyenne'] is not None]
        resume = {
            'note_moyenne_globale': round(sum(notes) / len(notes), 1) if notes else None,
            'nb_avis': sum(c['nb_avis'] for c in contenus),
            'nb_favoris': sum(c['nb_favoris'] for c in contenus),
            'nb_contenus_notes': len(notes),
        }
        return Response({
            'resume': resume,
            'contenus': contenus,
            'derniers_commentaires': AvisSerializer(commentaires, many=True).data,
        })
