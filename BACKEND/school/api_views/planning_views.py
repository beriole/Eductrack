import datetime
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from school.models import Eleves, PlanningsEtude, SessionsEtude, Matieres, Lacunes, Diagnostics
from school.serializers import PlanningEtudeSerializer, SessionEtudeSerializer

JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

# Disponibilités par défaut adaptées au rythme scolaire camerounais.
# Lun/mar/jeu/ven : révision du soir après l'école.
# Mercredi : l'école finit tôt → après-midi libre (créneau plus long → 3 matières).
# Samedi : matinée libre (pas d'école). Dimanche : révision légère / repos.
DISPONIBILITES_CAMEROUNAISES = {
    'lundi':    ['18:00', '20:00'],
    'mardi':    ['18:00', '20:00'],
    'mercredi': ['14:00', '17:00'],
    'jeudi':    ['18:00', '20:00'],
    'vendredi': ['18:00', '20:00'],
    'samedi':   ['09:00', '12:00'],
    'dimanche': ['16:00', '18:00'],
}


def _matieres_prioritaires(eleve: Eleves, priorites_codes: list) -> list:
    """
    Construit la file pédagogique de l'élève : liste de tuples
    (matiere, poids, chapitre_lacune|None) triée par poids décroissant.

    Le poids privilégie les faiblesses réelles de l'élève :
      - lacunes détectées/en cours (poids ∝ 100 - taux_maitrise) ;
      - faibles scores au dernier diagnostic ;
      - matières explicitement priorisées par l'élève.
    Seules les matières du niveau de l'élève sont retenues.
    """
    niveau = eleve.niveau_scolaire
    matieres = [
        m for m in Matieres.objects.filter(actif=True)
        if not m.niveaux or niveau in m.niveaux
    ]
    if not matieres:  # filet de sécurité : aucune matière mappée au niveau
        matieres = list(Matieres.objects.filter(actif=True)[:3])

    # Lacunes → poids + chapitre à renforcer (on garde la plus sévère par matière).
    lacune_par_matiere = {}
    for lac in Lacunes.objects.filter(id_eleve=eleve, statut__in=['detectee', 'en_cours']):
        poids = float(100 - lac.taux_maitrise) / 100.0
        actuel = lacune_par_matiere.get(lac.id_matiere_id)
        if actuel is None or poids > actuel[0]:
            lacune_par_matiere[lac.id_matiere_id] = (poids, lac.chapitre)

    # Dernier diagnostic → score par matière (clé code ou nom).
    diag = Diagnostics.objects.filter(id_eleve=eleve).order_by('-date_passage').first()
    scores = diag.scores_par_matiere if diag else {}

    weighted = []
    for m in matieres:
        poids = 1.0
        chapitre = None
        lac = lacune_par_matiere.get(m.id_matiere)
        if lac:
            poids += 1.5 * lac[0]
            chapitre = lac[1]
        score = scores.get(m.code, scores.get(m.nom))
        if score is not None:
            try:
                poids += (100 - float(score)) / 100.0
            except (TypeError, ValueError):
                pass
        if priorites_codes and m.code in priorites_codes:
            poids += 1.0
        weighted.append((m, poids, chapitre))

    weighted.sort(key=lambda x: x[1], reverse=True)
    return weighted


def _construire_deck(weighted: list) -> list:
    """File de distribution : les matières les plus faibles reviennent plus souvent
    (2 à 3 fois) afin d'être révisées davantage sur la semaine. Déterministe."""
    deck = []
    for m, poids, _chap in weighted:
        if poids >= 2.0:
            repeats = 3
        elif poids >= 1.5:
            repeats = 2
        else:
            repeats = 1
        deck.extend([m] * repeats)
    return deck or [m for m, _p, _c in weighted]


def _generer_sessions(planning: PlanningsEtude, disponibilites: dict,
                      priorites: list, eleve: Eleves) -> list:
    """
    Génère les SessionsEtude en répartissant 2 à 3 matières par jour disponible,
    en priorisant les faiblesses de l'élève (lacunes, scores de diagnostic).

    disponibilites = {"lundi": ["18:00", "20:00"], "mercredi": ["14:00", "17:00"]}
    priorites = ["MATH", "PHY", "SVT"]   (codes matière, boost optionnel)
    """
    weighted = _matieres_prioritaires(eleve, priorites)
    if not weighted:
        return []
    chapitre_par_matiere = {m.id_matiere: chap for m, _p, chap in weighted}
    deck = _construire_deck(weighted)
    nb_matieres_distinctes = len(weighted)

    sessions = []
    debut_semaine = planning.semaine_debut
    pos = 0  # pointeur global dans le deck, conserve la rotation entre les jours

    for i, jour in enumerate(JOURS_SEMAINE):
        creneaux = disponibilites.get(jour, [])
        if len(creneaux) < 2:
            continue
        try:
            heure_debut = datetime.datetime.strptime(creneaux[0], '%H:%M').time()
            heure_fin = datetime.datetime.strptime(creneaux[1], '%H:%M').time()
        except ValueError:
            continue

        date_jour = debut_semaine + datetime.timedelta(days=i)
        base = datetime.datetime.combine(date_jour, heure_debut)
        total_min = int((datetime.datetime.combine(date_jour, heure_fin) - base).seconds / 60)
        if total_min < 15:
            continue

        # 3 matières si le créneau est long (≥ 2h30), sinon 2 — borné aux matières dispo.
        n = 3 if total_min >= 150 else 2
        n = min(n, nb_matieres_distinctes)
        duree = max(15, min(total_min // n, 480))

        # Sélectionne n matières distinctes pour la journée depuis le deck pondéré.
        choisies = []
        tentatives = 0
        while len(choisies) < n and tentatives < len(deck):
            m = deck[pos % len(deck)]
            pos += 1
            tentatives += 1
            if m not in choisies:
                choisies.append(m)

        for k, matiere in enumerate(choisies):
            date_heure = timezone.make_aware(base + datetime.timedelta(minutes=k * duree))
            chapitre = chapitre_par_matiere.get(matiere.id_matiere)
            objectif = f"Renforcer : {chapitre}" if chapitre else f"Révision — {matiere.nom}"
            sessions.append(SessionsEtude.objects.create(
                id_planning=planning,
                id_matiere=matiere,
                date_heure=date_heure,
                duree_minutes=duree,
                objectif=objectif[:200],
            ))

    return sessions


class PlanningCreateView(APIView):
    """Crée (ou remplace) le planning de la semaine pour l'élève."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Eleves.DoesNotExist:
            return Response({"error": "Profil introuvable."}, status=status.HTTP_404_NOT_FOUND)

        semaine_str = request.data.get('semaine_debut')
        disponibilites = request.data.get('disponibilites', {})
        priorites = request.data.get('priorites_matieres', [])

        # Génération automatique : aucune dispo fournie (ou mode="auto") →
        # on applique le calendrier réaliste camerounais.
        if not disponibilites or request.data.get('mode') == 'auto':
            disponibilites = dict(DISPONIBILITES_CAMEROUNAISES)

        if semaine_str:
            try:
                semaine_debut = datetime.date.fromisoformat(semaine_str)
            except ValueError:
                return Response({"error": "Format de date invalide (YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            today = timezone.now().date()
            semaine_debut = today - datetime.timedelta(days=today.weekday())

        # Désactiver l'ancien planning actif
        PlanningsEtude.objects.filter(id_eleve=eleve, actif=True).update(actif=False)

        planning = PlanningsEtude.objects.create(
            id_eleve=eleve,
            semaine_debut=semaine_debut,
            disponibilites=disponibilites,
            priorites_matieres=priorites,
            actif=True,
        )

        sessions = _generer_sessions(planning, disponibilites, priorites, eleve)
        planning.nb_sessions = len(sessions)
        planning.save(update_fields=['nb_sessions'])

        return Response({
            "planning": PlanningEtudeSerializer(planning).data,
            "sessions": SessionEtudeSerializer(sessions, many=True).data,
        }, status=status.HTTP_201_CREATED)


class PlanningActifView(APIView):
    """Retourne le planning actif de l'élève avec ses sessions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'eleve':
            return Response({"error": "Réservé aux élèves."}, status=status.HTTP_403_FORBIDDEN)

        planning = PlanningsEtude.objects.filter(
            id_eleve__id_utilisateur=request.user.id_utilisateur, actif=True
        ).prefetch_related('sessions').first()

        if not planning:
            return Response({"planning": None, "sessions": []})

        return Response({
            "planning": PlanningEtudeSerializer(planning).data,
            "sessions": SessionEtudeSerializer(planning.sessions.order_by('date_heure'), many=True).data,
        })


class PlanningListView(generics.ListAPIView):
    serializer_class = PlanningEtudeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'eleve':
            return PlanningsEtude.objects.none()
        return PlanningsEtude.objects.filter(
            id_eleve__id_utilisateur=self.request.user.id_utilisateur
        ).order_by('-semaine_debut')


class SessionEtudeCompleterView(APIView):
    """Marque une session d'étude comme complétée."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id_session_etude):
        try:
            session = SessionsEtude.objects.get(
                id_session_etude=id_session_etude,
                id_planning__id_eleve__id_utilisateur=request.user.id_utilisateur,
            )
        except SessionsEtude.DoesNotExist:
            return Response({"error": "Session introuvable."}, status=status.HTTP_404_NOT_FOUND)

        session.completee = True
        session.save(update_fields=['completee'])

        # Bonus XP pour session complétée
        try:
            eleve = Eleves.objects.get(id_utilisateur=request.user.id_utilisateur)
            xp = max(5, session.duree_minutes // 10)
            eleve.points_gamification += xp
            eleve.save(update_fields=['points_gamification'])
        except Eleves.DoesNotExist:
            xp = 0

        return Response({**SessionEtudeSerializer(session).data, "xp_gagne": xp}, status=status.HTTP_200_OK)
