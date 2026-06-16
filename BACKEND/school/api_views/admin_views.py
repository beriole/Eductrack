"""Back-office super-admin (role='admin').

Pilotage, gestion des utilisateurs, modération du contenu, finances,
rémunérations, gestion de la plateforme, communication de masse et audit.
Toutes les vues exigent IsAdmin.
"""
import datetime

from django.db.models import Count, Sum, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from school.permissions import IsAdmin
from school.models import (
    Utilisateur, Eleves, Enseignants, Parents, Cours, Epreuves,
    Abonnements, Paiements, RemunerationEnseignant, SessionsExamen,
    Matieres, Badges, Defis, Notifications, JournalAdmin,
)
from school.serializers import MatiereSerializer, BadgeSerializer, DefiSerializer
from school.utils import notify_user


# ── Helpers ───────────────────────────────────────────────────────────────────

def log_admin(admin_user, action, cible_type=None, cible_id=None, **details):
    """Trace une action sensible dans le journal d'audit."""
    JournalAdmin.objects.create(
        id_admin=admin_user, action=action, cible_type=cible_type,
        cible_id=str(cible_id) if cible_id is not None else None, details=details,
    )


def _paginate(request, qs, mapper):
    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        size = min(200, max(1, int(request.query_params.get('page_size', 20))))
    except (TypeError, ValueError):
        size = 20
    total = qs.count()
    start = (page - 1) * size
    rows = list(qs[start:start + size])
    return {
        'count': total, 'page': page, 'has_next': start + size < total,
        'results': [mapper(o) for o in rows],
    }


def _week_buckets(qs, date_field, value=None, weeks=6):
    """Série hebdomadaire (somme de `value` ou comptage) sur les N dernières semaines."""
    now = timezone.now()
    out = []
    for i in range(weeks - 1, -1, -1):
        fin = now - datetime.timedelta(days=7 * i)
        debut = fin - datetime.timedelta(days=7)
        win = qs.filter(**{f'{date_field}__range': (debut, fin)})
        if value:
            v = win.aggregate(s=Sum(value))['s'] or 0
            val = float(v)
        else:
            val = win.count()
        out.append({'label': debut.strftime('%d/%m'), 'valeur': val})
    return out


# ── Mappers ─────────────────────────────────────────────────────────────────--

def _user_row(u):
    return {
        'id_utilisateur': str(u.id_utilisateur),
        'nom': u.nom, 'prenom': u.prenom, 'email': u.email,
        'role': u.role, 'actif': u.actif, 'email_verifie': u.email_verifie,
        'date_creation': u.date_creation.isoformat() if u.date_creation else None,
        'derniere_connexion': u.derniere_connexion.isoformat() if u.derniere_connexion else None,
    }


def _abo_row(a):
    return {
        'id_abonnement': str(a.id_abonnement), 'email': a.id_utilisateur.email,
        'formule': a.formule, 'montant': float(a.montant), 'periodicite': a.periodicite,
        'statut': a.statut, 'date_debut': a.date_debut.isoformat(),
        'date_expiration': a.date_expiration.isoformat(),
    }


def _paie_row(p):
    return {
        'id_paiement': str(p.id_paiement), 'email': p.id_utilisateur.email,
        'montant': float(p.montant), 'methode_paiement': p.methode_paiement,
        'reference_transaction': p.reference_transaction, 'statut': p.statut,
        'date_paiement': p.date_paiement.isoformat() if p.date_paiement else None,
    }


def _remun_row(r):
    return {
        'id_remuneration': str(r.id_remuneration),
        'enseignant': f"{r.id_enseignant.prenom} {r.id_enseignant.nom}",
        'periode_debut': r.periode_debut.isoformat(), 'periode_fin': r.periode_fin.isoformat(),
        'nb_vues_cours': r.nb_vues_cours, 'montant_calcule': float(r.montant_calcule),
        'montant_verse': float(r.montant_verse), 'statut_paiement': r.statut_paiement,
    }


def _audit_row(j):
    return {
        'id_journal': str(j.id_journal),
        'admin': (j.id_admin.email if j.id_admin else 'système'),
        'action': j.action, 'cible_type': j.cible_type, 'cible_id': j.cible_id,
        'details': j.details, 'date': j.date.isoformat(),
    }


# ── 1. Pilotage ───────────────────────────────────────────────────────────────

class AdminOverviewView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        now = timezone.now()
        j7 = now - datetime.timedelta(days=7)
        j30 = now - datetime.timedelta(days=30)

        users = Utilisateur.objects.all()
        par_role = {r['role']: r['n'] for r in users.values('role').annotate(n=Count('id_utilisateur'))}

        actifs_7j = (
            SessionsExamen.objects.filter(date_fin__gte=j7)
            .values('id_eleve').distinct().count()
        )

        paiements_ok = Paiements.objects.filter(statut='confirme')
        revenu_total = float(paiements_ok.aggregate(s=Sum('montant'))['s'] or 0)
        revenu_30j = float(paiements_ok.filter(date_paiement__gte=j30).aggregate(s=Sum('montant'))['s'] or 0)

        abos_actifs = Abonnements.objects.filter(statut='actif')
        abos_par_formule = {a['formule']: a['n'] for a in abos_actifs.values('formule').annotate(n=Count('id_abonnement'))}

        cours_par_statut = {c['statut']: c['n'] for c in Cours.objects.values('statut').annotate(n=Count('id_cours'))}
        epreuves_par_statut = {e['statut']: e['n'] for e in Epreuves.objects.values('statut').annotate(n=Count('id_epreuve'))}

        moderation_attente = (
            Cours.objects.filter(statut='en_revision').count()
            + Epreuves.objects.filter(statut='brouillon').count()
        )

        return Response({
            'utilisateurs': {
                'total': users.count(),
                'eleves': par_role.get('eleve', 0),
                'parents': par_role.get('parent', 0),
                'enseignants': par_role.get('enseignant', 0),
                'admins': par_role.get('admin', 0),
                'nouveaux_7j': users.filter(date_creation__gte=j7).count(),
                'nouveaux_30j': users.filter(date_creation__gte=j30).count(),
                'actifs_7j': actifs_7j,
            },
            'finances': {
                'revenu_total': revenu_total,
                'revenu_30j': revenu_30j,
                'abonnements_actifs': abos_actifs.count(),
                'abonnements_par_formule': abos_par_formule,
                'paiements_en_attente': Paiements.objects.filter(statut='en_attente').count(),
            },
            'contenu': {
                'cours_par_statut': cours_par_statut,
                'epreuves_par_statut': epreuves_par_statut,
                'sessions_total': SessionsExamen.objects.filter(statut='termine').count(),
                'moderation_attente': moderation_attente,
            },
            'series': {
                'inscriptions': _week_buckets(users, 'date_creation'),
                'revenus': _week_buckets(paiements_ok, 'date_paiement', value='montant'),
            },
        })


# ── 2. Utilisateurs ───────────────────────────────────────────────────────────

class AdminUsersView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Utilisateur.objects.all().order_by('-date_creation')
        role = request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        actif = request.query_params.get('actif')
        if actif in ('true', 'false'):
            qs = qs.filter(actif=(actif == 'true'))
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(email__icontains=search) | Q(nom__icontains=search) | Q(prenom__icontains=search)
            )
        return Response(_paginate(request, qs, _user_row))


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, user_id):
        u = Utilisateur.objects.filter(id_utilisateur=user_id).first()
        if not u:
            return Response({'error': 'Utilisateur introuvable.'}, status=404)
        data = _user_row(u)
        data['telephone'] = u.telephone
        data['langue'] = u.langue

        if u.role == 'eleve':
            e = Eleves.objects.filter(id_utilisateur=u.id_utilisateur).first()
            if e:
                data['profil'] = {
                    'niveau_scolaire': e.niveau_scolaire, 'serie': e.serie, 'region': e.region,
                    'score_global': e.score_global, 'streak_jours': e.streak_jours,
                    'points': e.points_gamification,
                    'nb_sessions': SessionsExamen.objects.filter(id_eleve=e, statut='termine').count(),
                }
        elif u.role == 'enseignant':
            ens = Enseignants.objects.filter(id_utilisateur=u.id_utilisateur).first()
            if ens:
                data['profil'] = {
                    'specialite': ens.specialite, 'verifie': ens.verifie,
                    'nb_cours': ens.nb_cours, 'total_gains': float(ens.total_gains),
                }
        abo = Abonnements.objects.filter(id_utilisateur=u, statut='actif').first()
        data['abonnement'] = _abo_row(abo) if abo else None
        return Response(data)

    def patch(self, request, user_id):
        u = Utilisateur.objects.filter(id_utilisateur=user_id).first()
        if not u:
            return Response({'error': 'Utilisateur introuvable.'}, status=404)
        if str(u.id_utilisateur) == str(request.user.id_utilisateur):
            return Response({'error': 'Vous ne pouvez pas modifier votre propre compte ici.'}, status=400)

        changed = {}
        if 'actif' in request.data:
            u.actif = bool(request.data['actif']); changed['actif'] = u.actif
        if 'email_verifie' in request.data:
            u.email_verifie = bool(request.data['email_verifie']); changed['email_verifie'] = u.email_verifie
        u.save()

        # Vérification d'un enseignant.
        if 'verifie' in request.data and u.role == 'enseignant':
            ens = Enseignants.objects.filter(id_utilisateur=u.id_utilisateur).first()
            if ens:
                ens.verifie = bool(request.data['verifie']); ens.save(update_fields=['verifie'])
                changed['verifie'] = ens.verifie
                if ens.verifie:
                    notify_user(ens, "Compte enseignant vérifié",
                                "Votre profil enseignant a été vérifié par l'administration.",
                                type_notif="alerte")

        log_admin(request.user, 'maj_utilisateur', 'Utilisateur', u.id_utilisateur, **changed)
        return Response(_user_row(u))


# ── 3. Modération ─────────────────────────────────────────────────────────────

class AdminModerationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        cours = Cours.objects.filter(statut='en_revision').select_related('id_enseignant', 'id_matiere').order_by('date_creation')
        items = [{
            'type': 'cours', 'id': str(c.id_cours), 'titre': c.titre,
            'matiere': c.id_matiere.nom if c.id_matiere else '—',
            'code': c.id_matiere.code if c.id_matiere else '',
            'niveau': c.niveau,
            'auteur': f"{c.id_enseignant.prenom} {c.id_enseignant.nom}",
            'has_pdf': bool(c.fichier_pdf), 'date': c.date_creation.isoformat(),
        } for c in cours]
        return Response({'count': len(items), 'results': items})


class AdminCoursValiderView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, id_cours):
        c = Cours.objects.filter(id_cours=id_cours).first()
        if not c:
            return Response({'error': 'Cours introuvable.'}, status=404)
        c.statut = 'publie'
        c.valide = True
        c.date_publication = timezone.now()
        c.save(update_fields=['statut', 'valide', 'date_publication'])
        notify_user(c.id_enseignant, "Cours publié",
                    f"Votre cours « {c.titre} » a été validé et publié.",
                    type_notif="nouveau_contenu")
        log_admin(request.user, 'valider_cours', 'Cours', c.id_cours, titre=c.titre)
        return Response({'message': 'Cours publié.'})


class AdminCoursRejeterView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, id_cours):
        c = Cours.objects.filter(id_cours=id_cours).first()
        if not c:
            return Response({'error': 'Cours introuvable.'}, status=404)
        motif = (request.data.get('motif') or '').strip() or "Non précisé"
        c.statut = 'brouillon'
        c.valide = False
        c.save(update_fields=['statut', 'valide'])
        notify_user(c.id_enseignant, "Cours à revoir",
                    f"Votre cours « {c.titre} » a été renvoyé en brouillon. Motif : {motif}",
                    type_notif="alerte")
        log_admin(request.user, 'rejeter_cours', 'Cours', c.id_cours, titre=c.titre, motif=motif)
        return Response({'message': 'Cours renvoyé en brouillon.'})


# ── 4. Finances ───────────────────────────────────────────────────────────────

class AdminAbonnementsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Abonnements.objects.select_related('id_utilisateur').order_by('-date_creation')
        for f in ('formule', 'statut'):
            v = request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return Response(_paginate(request, qs, _abo_row))


class AdminFinanceStatsView(APIView):
    """Statistiques financières détaillées pour l'onglet Finances."""
    permission_classes = [IsAuthenticated, IsAdmin]

    _MULT = {'mensuel': 1, 'trimestriel': 3, 'annuel': 12}

    def get(self, request):
        now = timezone.now()
        j30 = now - datetime.timedelta(days=30)

        paie_ok = Paiements.objects.filter(statut='confirme')
        revenu_total = float(paie_ok.aggregate(s=Sum('montant'))['s'] or 0)
        revenu_30j = float(paie_ok.filter(date_paiement__gte=j30).aggregate(s=Sum('montant'))['s'] or 0)

        par_methode = {r['methode_paiement']: float(r['s'] or 0)
                       for r in paie_ok.values('methode_paiement').annotate(s=Sum('montant'))}

        tous_paie = Paiements.objects.count()
        taux_confirmation = round(paie_ok.count() / tous_paie * 100) if tous_paie else 0

        abos = Abonnements.objects.all()
        abos_par_statut = {r['statut']: r['n'] for r in abos.values('statut').annotate(n=Count('id_abonnement'))}
        abos_par_formule = {r['formule']: r['n'] for r in abos.filter(statut='actif').values('formule').annotate(n=Count('id_abonnement'))}

        # MRR : on ramène chaque abonnement actif à un montant mensuel.
        mrr = 0.0
        for a in abos.filter(statut='actif'):
            mrr += float(a.montant) / self._MULT.get(a.periodicite, 1)

        return Response({
            'revenu_total': revenu_total,
            'revenu_30j': revenu_30j,
            'mrr': round(mrr),
            'abonnements_actifs': abos.filter(statut='actif').count(),
            'paiements_en_attente': Paiements.objects.filter(statut='en_attente').count(),
            'taux_confirmation': taux_confirmation,
            'revenu_par_methode': par_methode,
            'abonnements_par_statut': abos_par_statut,
            'abonnements_par_formule': abos_par_formule,
            'serie_revenus': _week_buckets(paie_ok, 'date_paiement', value='montant'),
        })


class AdminAbonnementUpdateView(APIView):
    """Gestion d'un abonnement par l'admin : statut, formule, échéance, renouvellement."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request, id_abonnement):
        a = Abonnements.objects.filter(id_abonnement=id_abonnement).select_related('id_utilisateur').first()
        if not a:
            return Response({'error': 'Abonnement introuvable.'}, status=404)

        changed = {}
        statuts = {c[0] for c in Abonnements.STATUT_CHOICES}
        formules = {c[0] for c in Abonnements.FORMULE_CHOICES}

        if 'statut' in request.data and request.data['statut'] in statuts:
            a.statut = request.data['statut']; changed['statut'] = a.statut
        if 'formule' in request.data and request.data['formule'] in formules:
            a.formule = request.data['formule']; changed['formule'] = a.formule
        if 'renouvellement_auto' in request.data:
            a.renouvellement_auto = bool(request.data['renouvellement_auto']); changed['renouvellement_auto'] = a.renouvellement_auto
        # Prolongation : ajoute N jours à l'échéance (réactive si expiré).
        try:
            jours = int(request.data.get('prolonger_jours', 0) or 0)
        except (TypeError, ValueError):
            jours = 0
        if jours:
            base = max(a.date_expiration, timezone.now().date())
            a.date_expiration = base + datetime.timedelta(days=jours)
            if a.statut in ('expire',):
                a.statut = 'actif'; changed['statut'] = a.statut
            changed['prolonge_jours'] = jours

        a.save()
        log_admin(request.user, 'maj_abonnement', 'Abonnements', a.id_abonnement, **changed)
        return Response(_abo_row(a))


class AdminPaiementsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Paiements.objects.select_related('id_utilisateur').order_by('-date_paiement')
        for f in ('statut', 'methode_paiement'):
            v = request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return Response(_paginate(request, qs, _paie_row))


class AdminPaiementActionView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, id_paiement):
        p = Paiements.objects.filter(id_paiement=id_paiement).first()
        if not p:
            return Response({'error': 'Paiement introuvable.'}, status=404)
        action = request.data.get('action')
        if action == 'confirmer':
            p.statut = 'confirme'; p.date_confirmation = timezone.now()
        elif action == 'rembourser':
            p.statut = 'rembourse'
        else:
            return Response({'error': "action doit être 'confirmer' ou 'rembourser'."}, status=400)
        p.save()
        log_admin(request.user, f'paiement_{action}', 'Paiements', p.id_paiement, montant=float(p.montant))
        return Response(_paie_row(p))


class AdminRemunerationsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = RemunerationEnseignant.objects.select_related('id_enseignant').order_by('-date_generation')
        statut = request.query_params.get('statut_paiement')
        if statut:
            qs = qs.filter(statut_paiement=statut)
        return Response(_paginate(request, qs, _remun_row))


class AdminRemunerationPayerView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, id_remuneration):
        r = RemunerationEnseignant.objects.filter(id_remuneration=id_remuneration).first()
        if not r:
            return Response({'error': 'Rémunération introuvable.'}, status=404)
        if r.statut_paiement == 'verse':
            return Response({'error': 'Déjà versée.'}, status=400)
        r.montant_verse = r.montant_calcule
        r.statut_paiement = 'verse'
        r.date_versement = timezone.now()
        r.save(update_fields=['montant_verse', 'statut_paiement', 'date_versement'])
        notify_user(r.id_enseignant, "Rémunération versée",
                    f"Votre rémunération de {r.montant_verse} FCFA a été versée.",
                    type_notif="alerte")
        log_admin(request.user, 'payer_remuneration', 'RemunerationEnseignant', r.id_remuneration,
                  montant=float(r.montant_verse))
        return Response(_remun_row(r))


# ── 5. Plateforme : matières / badges / défis (CRUD) ──────────────────────────

class AdminMatiereListCreateView(generics.ListCreateAPIView):
    queryset = Matieres.objects.all().order_by('nom')
    serializer_class = MatiereSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = None


class AdminMatiereDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Matieres.objects.all()
    serializer_class = MatiereSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    lookup_field = 'id_matiere'


class AdminBadgeListCreateView(generics.ListCreateAPIView):
    queryset = Badges.objects.all().order_by('categorie', 'nom')
    serializer_class = BadgeSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = None


class AdminBadgeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Badges.objects.all()
    serializer_class = BadgeSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    lookup_field = 'id_badge'


class AdminDefiListCreateView(generics.ListCreateAPIView):
    queryset = Defis.objects.all().order_by('-actif', 'titre')
    serializer_class = DefiSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = None


class AdminDefiDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Defis.objects.all()
    serializer_class = DefiSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    lookup_field = 'id_defi'


# ── 6. Communication de masse ─────────────────────────────────────────────────

class AdminBroadcastView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        titre = (request.data.get('titre') or '').strip()
        message = (request.data.get('message') or '').strip()
        cible = request.data.get('cible') or 'all'   # all | eleve | parent | enseignant
        type_notif = request.data.get('type_notif') or 'alerte'
        if not titre or not message:
            return Response({'error': 'titre et message sont requis.'}, status=400)

        qs = Utilisateur.objects.filter(actif=True)
        if cible in ('eleve', 'parent', 'enseignant', 'admin'):
            qs = qs.filter(role=cible)
        envoyes = 0
        for u in qs.iterator():
            notify_user(u, titre, message, type_notif=type_notif)
            envoyes += 1
        log_admin(request.user, 'broadcast', 'Notifications', None,
                  cible=cible, destinataires=envoyes, titre=titre)
        return Response({'message': f'Notification envoyée à {envoyes} utilisateur(s).', 'destinataires': envoyes})


# ── 7. Audit ──────────────────────────────────────────────────────────────────

class AdminAuditView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = JournalAdmin.objects.select_related('id_admin').all()
        action = request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)
        return Response(_paginate(request, qs, _audit_row))
