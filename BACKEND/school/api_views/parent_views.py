from io import BytesIO
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.http import FileResponse
from school.models import (
    CodeLiaison, EleveParent, Eleves, Parents, RapportsParentaux,
    SessionsExamen, SessionsFocus, Lacunes, EleveBadges,
)
from school.serializers import EleveSerializer, RapportParentalSerializer
from school.tasks import send_parent_link_notification
from django.utils import timezone
from django.db.models import Avg, Sum, Count
import datetime


def construire_stats_rapport(eleve, debut, fin):
    """Calcule les statistiques réelles d'un élève sur une période donnée.

    Retourne un dict prêt à alimenter un RapportsParentaux (ou un aperçu).
    """
    debut_dt = timezone.make_aware(datetime.datetime.combine(debut, datetime.time.min))
    fin_dt = timezone.make_aware(datetime.datetime.combine(fin, datetime.time.max))

    sessions = SessionsExamen.objects.filter(
        id_eleve=eleve, statut='termine',
        date_fin__range=(debut_dt, fin_dt),
    )
    nb_sessions = sessions.count()
    moyenne = sessions.aggregate(m=Avg('note_obtenue'))['m']
    # Note sur 20 → ramenée sur 20 pour l'affichage du rapport.
    moyenne_globale = round(float(moyenne), 2) if moyenne is not None else None

    # Temps d'étude = sessions d'examen + sessions focus (en minutes).
    temps_examen = sessions.aggregate(s=Sum('duree_reelle_sec'))['s'] or 0
    focus = SessionsFocus.objects.filter(
        id_eleve=eleve, date_debut__range=(debut_dt, fin_dt),
    )
    temps_focus = focus.aggregate(s=Sum('temps_total_min'))['s'] or 0
    temps_etude_total = round(temps_examen / 60) + temps_focus

    matieres = list(
        sessions.values_list('id_epreuve__id_matiere__nom', flat=True).distinct()
    )
    matieres_travaillees = [m for m in matieres if m]

    lacunes = (
        Lacunes.objects.filter(id_eleve=eleve)
        .exclude(statut='maitrisee')
        .order_by('taux_maitrise')[:5]
    )
    lacunes_principales = [f"{l.notion} ({l.id_matiere.nom})" for l in lacunes]

    return {
        'moyenne_globale': moyenne_globale,
        'nb_sessions': nb_sessions,
        'temps_etude_total': temps_etude_total,
        'matieres_travaillees': matieres_travaillees,
        'lacunes_principales': lacunes_principales,
    }


def _stats_periode(eleve, debut_dt, fin_dt):
    """Indicateurs clés d'un élève sur une fenêtre [debut_dt, fin_dt]."""
    sessions = SessionsExamen.objects.filter(
        id_eleve=eleve, statut='termine', date_fin__range=(debut_dt, fin_dt),
    )
    nb = sessions.count()
    moyenne = sessions.aggregate(m=Avg('note_obtenue'))['m']
    reussies = sessions.filter(note_obtenue__gte=10).count()
    temps_sec = sessions.aggregate(s=Sum('duree_reelle_sec'))['s'] or 0
    focus_min = SessionsFocus.objects.filter(
        id_eleve=eleve, date_debut__range=(debut_dt, fin_dt),
    ).aggregate(s=Sum('temps_total_min'))['s'] or 0
    jours_actifs = len({s.date_fin.date() for s in sessions if s.date_fin})
    return {
        'nb_sessions': nb,
        'moyenne': round(float(moyenne), 1) if moyenne is not None else None,
        'taux_reussite': round(reussies / nb * 100) if nb else 0,
        'temps_etude_min': round(temps_sec / 60) + int(focus_min),
        'jours_actifs': jours_actifs,
    }


def construire_suivi_enfant(eleve):
    """Agrège l'ensemble du suivi d'un enfant pour l'espace parent (un seul appel)."""
    now = timezone.now()
    debut_7 = now - datetime.timedelta(days=7)
    debut_14 = now - datetime.timedelta(days=14)

    semaine = _stats_periode(eleve, debut_7, now)
    precedente = _stats_periode(eleve, debut_14, debut_7)

    # Tendance de la moyenne (semaine vs semaine précédente).
    delta = None
    if semaine['moyenne'] is not None and precedente['moyenne'] is not None:
        delta = round(semaine['moyenne'] - precedente['moyenne'], 1)

    # Présence : dernière session terminée.
    derniere = (
        SessionsExamen.objects.filter(id_eleve=eleve, statut='termine')
        .order_by('-date_fin').values_list('date_fin', flat=True).first()
    )
    jours_inactif = (now.date() - derniere.date()).days if derniere else None

    # Progression : 6 fenêtres de 7 jours (de la plus ancienne à la plus récente).
    progression = []
    for i in range(5, -1, -1):
        f = now - datetime.timedelta(days=7 * i)
        d = f - datetime.timedelta(days=7)
        st = _stats_periode(eleve, d, f)
        progression.append({
            'label': d.strftime('%d/%m'),
            'moyenne': st['moyenne'],
            'nb_sessions': st['nb_sessions'],
        })

    # Performance par matière (tout l'historique terminé).
    par_matiere = []
    rows = (
        SessionsExamen.objects.filter(id_eleve=eleve, statut='termine')
        .values('id_epreuve__id_matiere__nom', 'id_epreuve__id_matiere__code')
        .annotate(moyenne=Avg('note_obtenue'), nb=Count('id_session'))
        .order_by('-nb')
    )
    for r in rows:
        nom = r['id_epreuve__id_matiere__nom']
        if not nom:
            continue
        moy = round(float(r['moyenne']), 1) if r['moyenne'] is not None else None
        maitrise = 'inconnu'
        if moy is not None:
            maitrise = 'fort' if moy >= 14 else 'moyen' if moy >= 10 else 'faible'
        par_matiere.append({
            'matiere': nom, 'code': r['id_epreuve__id_matiere__code'] or '',
            'moyenne': moy, 'nb_sessions': r['nb'], 'maitrise': maitrise,
        })

    # Lacunes actives (les moins maîtrisées d'abord).
    lacunes_qs = (
        Lacunes.objects.filter(id_eleve=eleve).exclude(statut='maitrisee')
        .select_related('id_matiere').order_by('taux_maitrise')[:8]
    )
    lacunes = [{
        'notion': l.notion, 'chapitre': l.chapitre,
        'matiere': l.id_matiere.nom, 'code': l.id_matiere.code,
        'taux_maitrise': round(float(l.taux_maitrise)), 'statut': l.statut,
    } for l in lacunes_qs]

    # Activité récente (8 dernières sessions).
    recentes_qs = (
        SessionsExamen.objects.filter(id_eleve=eleve, statut='termine')
        .select_related('id_epreuve', 'id_epreuve__id_matiere').order_by('-date_fin')[:8]
    )
    activite = [{
        'titre': s.id_epreuve.titre,
        'matiere': s.id_epreuve.id_matiere.nom if s.id_epreuve.id_matiere else '—',
        'code': s.id_epreuve.id_matiere.code if s.id_epreuve.id_matiere else '',
        'mode': s.mode,
        'note': round(float(s.note_obtenue), 1) if s.note_obtenue is not None else None,
        'date': s.date_fin.isoformat() if s.date_fin else None,
    } for s in recentes_qs]

    # Badges récents.
    badges_qs = (
        EleveBadges.objects.filter(id_eleve=eleve)
        .select_related('id_badge').order_by('-date_obtention')[:4]
    )
    badges = [{
        'nom': b.id_badge.nom, 'categorie': b.id_badge.categorie,
        'date': b.date_obtention.isoformat(),
    } for b in badges_qs]

    # Alertes proactives pour le parent.
    alertes = []
    if jours_inactif is not None and jours_inactif >= 3:
        alertes.append({'niveau': 'warning', 'icone': 'time-outline',
                        'texte': f"Inactif depuis {jours_inactif} jours."})
    if semaine['nb_sessions'] == 0:
        alertes.append({'niveau': 'warning', 'icone': 'alert-circle-outline',
                        'texte': "Aucune activité cette semaine."})
    if delta is not None and delta <= -1:
        alertes.append({'niveau': 'danger', 'icone': 'trending-down-outline',
                        'texte': f"Moyenne en baisse de {abs(delta)} pts vs la semaine passée."})
    if lacunes and lacunes[0]['taux_maitrise'] < 30:
        l0 = lacunes[0]
        alertes.append({'niveau': 'danger', 'icone': 'warning-outline',
                        'texte': f"Lacune critique : {l0['notion']} ({l0['matiere']})."})
    if eleve.streak_jours == 0:
        alertes.append({'niveau': 'info', 'icone': 'flame-outline',
                        'texte': "La régularité a été interrompue."})

    # Conseils actionnables (dédoublonnés en gardant l'ordre).
    conseils = []
    vus = set()
    for l in lacunes[:3]:
        msg = f"Encouragez-le à revoir « {l['notion']} » en {l['matiere']}."
        if msg not in vus:
            vus.add(msg)
            conseils.append(msg)
        if len(conseils) >= 2:
            break
    if semaine['temps_etude_min'] < 60:
        conseils.append("Proposez un créneau de révision quotidien de 20-30 min.")
    if not conseils:
        conseils.append("Continuez à le féliciter pour sa régularité 👏")

    return {
        'enfant': {
            'id_utilisateur': str(eleve.id_utilisateur),
            'prenom': eleve.prenom, 'nom': eleve.nom,
            'niveau_scolaire': eleve.niveau_scolaire, 'serie': eleve.serie,
            'region': eleve.region, 'etablissement': eleve.etablissement,
            'score_global': eleve.score_global, 'streak_jours': eleve.streak_jours,
            'points_gamification': eleve.points_gamification,
            'derniere_activite': derniere.isoformat() if derniere else None,
            'jours_inactif': jours_inactif,
        },
        'kpis': {
            'moyenne': semaine['moyenne'], 'moyenne_delta': delta,
            'taux_reussite': semaine['taux_reussite'],
            'temps_etude_min': semaine['temps_etude_min'],
            'jours_actifs': semaine['jours_actifs'],
            'nb_sessions': semaine['nb_sessions'],
        },
        'progression': progression,
        'par_matiere': par_matiere,
        'lacunes': lacunes,
        'activite_recente': activite,
        'badges_recents': badges,
        'alertes': alertes,
        'conseils': conseils,
    }


class EnfantSuiviView(APIView):
    """GET /parents/enfants/<enfant_id>/suivi/ — suivi complet d'un enfant lié."""
    permission_classes = [IsAuthenticated]

    def get(self, request, enfant_id):
        if request.user.role != 'parent':
            return Response({"error": "Réservé aux parents."}, status=status.HTTP_403_FORBIDDEN)
        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
            lien = EleveParent.objects.get(
                id_parent=parent, id_eleve__id_utilisateur=enfant_id, actif=True)
        except (Parents.DoesNotExist, EleveParent.DoesNotExist):
            return Response({"error": "Enfant introuvable ou non lié."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(construire_suivi_enfant(lien.id_eleve), status=status.HTTP_200_OK)


class LierEnfantView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents peuvent lier un enfant."}, status=status.HTTP_403_FORBIDDEN)
        
        code_str = request.data.get('code')
        if not code_str:
            return Response({"error": "Le code de liaison est requis."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            code_obj = CodeLiaison.objects.get(code=code_str)
        except CodeLiaison.DoesNotExist:
            return Response({"error": "Code invalide."}, status=status.HTTP_404_NOT_FOUND)

        if not code_obj.est_valide():
            return Response({"error": "Ce code a expiré ou a déjà été utilisé."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Parents.DoesNotExist:
            return Response({"error": "Profil parent introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Create relation
        EleveParent.objects.get_or_create(id_eleve=code_obj.id_eleve, id_parent=parent)
        
        # Mark code as used
        code_obj.utilise = True
        code_obj.save()

        # Notifier l'élève par email (tâche async)
        eleve = code_obj.id_eleve
        send_parent_link_notification.delay(
            eleve.email,
            eleve.prenom or eleve.nom,
            parent.prenom or '',
            parent.nom or '',
        )

        return Response({"message": "Enfant lié avec succès."}, status=status.HTTP_200_OK)

class EnfantsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents ont accès à cette vue."}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Parents.DoesNotExist:
            return Response({"error": "Profil parent introuvable."}, status=status.HTTP_404_NOT_FOUND)
        
        liens = EleveParent.objects.filter(id_parent=parent, actif=True)
        enfants = [lien.id_eleve for lien in liens]
        
        serializer = EleveSerializer(enfants, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class LienParentEleveDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, enfant_id):
        if request.user.role != 'parent':
            return Response({"error": "Accès refusé."}, status=status.HTTP_403_FORBIDDEN)

        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
            lien = EleveParent.objects.get(id_parent=parent, id_eleve__id_utilisateur=enfant_id)
            lien.actif = False # Soft delete
            lien.save()
            return Response({"message": "Lien révoqué."}, status=status.HTTP_204_NO_CONTENT)
        except (Parents.DoesNotExist, EleveParent.DoesNotExist):
            return Response({"error": "Lien introuvable."}, status=status.HTTP_404_NOT_FOUND)

class RapportParentalListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents y ont accès."}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
        except Parents.DoesNotExist:
            return Response({"error": "Profil introuvable."}, status=status.HTTP_404_NOT_FOUND)
            
        enfant_id = request.query_params.get('enfant_id')
        rapports = RapportsParentaux.objects.filter(id_parent=parent)
        
        if enfant_id:
            rapports = rapports.filter(id_eleve__id_utilisateur=enfant_id)
            
        serializer = RapportParentalSerializer(rapports.order_by('-date_generation'), many=True)
        return Response(serializer.data)

class RapportParentalGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents y ont accès."}, status=status.HTTP_403_FORBIDDEN)
            
        enfant_id = request.data.get('enfant_id')
        if not enfant_id:
            return Response({"error": "enfant_id est requis."}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
            lien = EleveParent.objects.get(id_parent=parent, id_eleve__id_utilisateur=enfant_id, actif=True)
            eleve = lien.id_eleve
        except (Parents.DoesNotExist, EleveParent.DoesNotExist):
            return Response({"error": "Enfant introuvable ou non lié."}, status=status.HTTP_404_NOT_FOUND)

        # Déterminer la période (par ex. les 7 derniers jours)
        now = timezone.now().date()
        debut = now - datetime.timedelta(days=7)

        # Vérifier si un rapport existe déjà pour aujourd'hui
        if RapportsParentaux.objects.filter(id_parent=parent, id_eleve=eleve, periode_fin=now).exists():
            return Response({"message": "Un rapport a déjà été généré pour aujourd'hui."}, status=status.HTTP_400_BAD_REQUEST)

        # Génération à la volée à partir des données réelles de l'élève
        stats = construire_stats_rapport(eleve, debut, now)
        rapport = RapportsParentaux.objects.create(
            id_parent=parent,
            id_eleve=eleve,
            periode_debut=debut,
            periode_fin=now,
            moyenne_globale=stats['moyenne_globale'],
            temps_etude_total=stats['temps_etude_total'],
            nb_sessions=stats['nb_sessions'],
            matieres_travaillees=stats['matieres_travaillees'],
            lacunes_principales=stats['lacunes_principales'],
            envoye=True,
        )

        return Response({
            "message": "Rapport généré avec succès.",
            "rapport": RapportParentalSerializer(rapport).data
        }, status=status.HTTP_201_CREATED)


class RapportPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, rapport_id):
        if request.user.role != 'parent':
            return Response({"error": "Seuls les parents peuvent accéder aux rapports PDF."}, status=status.HTTP_403_FORBIDDEN)

        try:
            parent = Parents.objects.get(id_utilisateur=request.user.id_utilisateur)
            rapport = RapportsParentaux.objects.get(id_rapport=rapport_id, id_parent=parent)
        except (Parents.DoesNotExist, RapportsParentaux.DoesNotExist):
            return Response({"error": "Rapport introuvable."}, status=status.HTTP_404_NOT_FOUND)

        eleve = rapport.id_eleve
        buffer = self._build_pdf(rapport, eleve)
        filename = f"rapport_{eleve.prenom}_{eleve.nom}_{rapport.periode_fin}.pdf"
        return FileResponse(buffer, as_attachment=True, filename=filename, content_type='application/pdf')

    @staticmethod
    def _build_pdf(rapport, eleve) -> BytesIO:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.colors import HexColor, white
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.units import cm

        PRIMARY = HexColor('#1E3A5F')
        ACCENT = HexColor('#6C63FF')

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                                rightMargin=2 * cm, leftMargin=2 * cm,
                                topMargin=2 * cm, bottomMargin=2 * cm)

        def style(name, **kw):
            return ParagraphStyle(name, **kw)

        title_s = style('T', fontSize=20, textColor=PRIMARY, spaceAfter=4, fontName='Helvetica-Bold')
        sub_s = style('S', fontSize=12, textColor=ACCENT, spaceAfter=12)
        info_s = style('I', fontSize=11, spaceAfter=4)
        head_s = style('H', fontSize=13, textColor=PRIMARY, fontName='Helvetica-Bold', spaceAfter=8)
        warn_s = style('W', fontSize=13, textColor=HexColor('#EF4444'), fontName='Helvetica-Bold', spaceAfter=8)
        foot_s = style('F', fontSize=9, textColor=HexColor('#9CA3AF'))

        story = [
            Paragraph("SmartSchool - Rapport de Suivi Parental", title_s),
            Paragraph(f"Periode : {rapport.periode_debut} au {rapport.periode_fin}", sub_s),
            Paragraph(f"<b>Eleve :</b> {eleve.prenom} {eleve.nom}", info_s),
            Paragraph(f"<b>Niveau :</b> {eleve.niveau_scolaire}", info_s),
            Paragraph(f"<b>Etablissement :</b> {eleve.etablissement or 'Non renseigne'}", info_s),
            Spacer(1, 0.5 * cm),
            Paragraph("Statistiques de la periode", head_s),
        ]

        data = [
            ['Indicateur', 'Valeur'],
            ['Moyenne globale', f"{rapport.moyenne_globale or 0} / 100"],
            ['Sessions de travail', str(rapport.nb_sessions)],
            ["Temps d'etude total", f"{rapport.temps_etude_total} min"],
            ['Score global', f"{eleve.score_global} / 100"],
            ['Streak actuel', f"{eleve.streak_jours} jours"],
            ['Points XP', str(eleve.points_gamification)],
        ]
        table = Table(data, colWidths=[10 * cm, 5 * cm])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#F9FAFB'), white]),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#E5E7EB')),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ]))
        story.append(table)
        story.append(Spacer(1, 0.5 * cm))

        if rapport.matieres_travaillees:
            story.append(Paragraph("Matieres travaillees", head_s))
            story.append(Paragraph(' | '.join(rapport.matieres_travaillees), info_s))
            story.append(Spacer(1, 0.3 * cm))

        if rapport.lacunes_principales:
            story.append(Paragraph("Lacunes detectees", warn_s))
            for lacune in rapport.lacunes_principales:
                story.append(Paragraph(f"[!] {lacune}", info_s))
            story.append(Spacer(1, 0.3 * cm))

        story.append(Spacer(1, 1 * cm))
        story.append(Paragraph(
            f"Rapport genere le {rapport.date_generation.strftime('%d/%m/%Y')} | SmartSchool",
            foot_s,
        ))

        doc.build(story)
        buffer.seek(0)
        return buffer

