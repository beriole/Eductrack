from django.urls import path
from school.api_views.auth_views import RegisterView, LoginView, LogoutView
from school.api_views.password_views import (
    EmailVerifyView,
    ResendVerificationEmailView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    PasswordChangeView,
)
from school.api_views.user_views import UserMeView, UserAvatarUploadView, PushTokenView
from school.api_views.parent_views import LierEnfantView, EnfantsListView, EnfantSuiviView, LienParentEleveDetailView, RapportParentalListView, RapportParentalGenerateView, RapportPDFView
from school.api_views.liaison_views import CodeLiaisonRegenerateView, CodeLiaisonCurrentView, EleveParentsListView, EleveRevokeParentView
from school.api_views.matiere_views import MatiereListView
from school.api_views.search_views import RechercheGlobaleView
from school.api_views.cours_views import (
    CoursListView, CoursDetailView, CoursSoumettreView, CoursPublierView, CoursDepublierView,
)
from school.api_views.epreuve_views import EpreuveListView, EpreuveDetailView, EpreuveQuestionsView
from school.api_views.assistant_views import QuestionAssistantView
from school.api_views.exercice_views import ExerciceGenererView
from school.api_views.import_views import EpreuveImportPDFView
from school.api_views.coach_views import CoachConseilView
from school.api_views.lecon_views import LeconGenererView, LeconListView, LeconMarquerLueView
from school.api_views.defis_views import LigueView, DefisListView, DefiReclamerView
from school.api_views.revision_views import RevisionDuJourView, RevisionCompleterView
from school.api_views.sync_views import SyncView
from school.api_views.gamification_views import XPView, BadgeListView, MesBadgesView, LeaderboardView
from school.api_views.analytique_views import DiagnosticListView, LacuneListView, LacuneDetailView, LacuneDetecterView, DashboardView
from school.api_views.session_views import SessionDemarrerView, SessionReponsesView, SessionTerminerView, SessionHistoriqueView, SessionDetailView, SessionCorrectionView
from school.api_views.notification_views import NotificationListView, NotificationMarkReadView, NotificationMarkAllReadView, NotificationCountView
from school.api_views.chatbot_views import ChatbotMessageView, ChatbotHistoriqueView, ChatbotFeedbackView
from school.api_views.focus_views import FocusStartView, FocusStopView, FocusListView
from school.api_views.payment_views import PaiementInitierView, PaiementStatutView, AbonnementListView, AbonnementActifView, FapshiWebhookView
from school.api_views.planning_views import PlanningCreateView, PlanningActifView, PlanningListView, SessionEtudeCompleterView
from school.api_views.orientation_views import (
    OrientationCreateView, OrientationListView, OrientationTestView, OrientationSoumettreView,
)
from school.api_views.enseignant_views import (
    EnseignantDashboardView, EnseignantCoursListView,
    EnseignantEpreuvesListView, EnseignantEpreuveDetailView,
    EnseignantExerciceCreateView, EnseignantExerciceQuestionsView,
    CoursPdfUploadView, EpreuvePdfUploadView,
)
from school.api_views.feedback_views import (
    AvisView, FavoriToggleView, FavorisListView, EnseignantRetoursView,
)
from school.api_views.redaction_views import RedactionAnalyseView
from school.api_views.concours_views import ConcoursListView
from school.api_views.admin_views import (
    AdminOverviewView, AdminUsersView, AdminUserDetailView,
    AdminModerationView, AdminCoursValiderView, AdminCoursRejeterView,
    AdminAbonnementsView, AdminAbonnementUpdateView, AdminFinanceStatsView,
    AdminPaiementsView, AdminPaiementActionView,
    AdminRemunerationsView, AdminRemunerationPayerView,
    AdminMatiereListCreateView, AdminMatiereDetailView,
    AdminBadgeListCreateView, AdminBadgeDetailView,
    AdminDefiListCreateView, AdminDefiDetailView,
    AdminBroadcastView, AdminAuditView,
)
from rest_framework_simplejwt.views import TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # ── Swagger ──────────────────────────────────────────────────────────────
    path('docs/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # ── Auth — inscription / connexion ────────────────────────────────────────
    path('auth/register/', RegisterView.as_view(), name='api-register'),
    path('auth/login/', LoginView.as_view(), name='api-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='api-refresh'),
    path('auth/logout/', LogoutView.as_view(), name='api-logout'),

    # ── Auth — email ──────────────────────────────────────────────────────────
    path('auth/email/verify/', EmailVerifyView.as_view(), name='api-email-verify'),
    path('auth/email/resend/', ResendVerificationEmailView.as_view(), name='api-email-resend'),

    # ── Auth — mot de passe ───────────────────────────────────────────────────
    path('auth/password/reset/', PasswordResetRequestView.as_view(), name='api-password-reset'),
    path('auth/password/reset/confirm/', PasswordResetConfirmView.as_view(), name='api-password-reset-confirm'),
    path('auth/password/change/', PasswordChangeView.as_view(), name='api-password-change'),

    # ── Profil utilisateur ────────────────────────────────────────────────────
    path('users/me/', UserMeView.as_view(), name='api-users-me'),
    path('users/me/avatar/', UserAvatarUploadView.as_view(), name='api-users-avatar'),
    path('users/me/push-token/', PushTokenView.as_view(), name='api-push-token'),

    # ── Code de liaison (côté élève) ──────────────────────────────────────────
    path('users/me/code-liaison/', CodeLiaisonCurrentView.as_view(), name='api-code-liaison-current'),
    path('users/me/code-liaison/regenerer/', CodeLiaisonRegenerateView.as_view(), name='api-code-liaison-regen'),

    # ── Parents liés (côté élève) ─────────────────────────────────────────────
    path('eleve/parents/', EleveParentsListView.as_view(), name='api-eleve-parents'),
    path('eleve/parents/<uuid:parent_id>/revoquer/', EleveRevokeParentView.as_view(), name='api-eleve-parent-revoquer'),

    # ── Gestion enfants (côté parent) ─────────────────────────────────────────
    path('parents/lier/', LierEnfantView.as_view(), name='api-parents-lier'),
    path('parents/enfants/', EnfantsListView.as_view(), name='api-parents-enfants'),
    path('parents/enfants/<uuid:enfant_id>/suivi/', EnfantSuiviView.as_view(), name='api-parents-enfant-suivi'),
    path('parents/lien/<uuid:enfant_id>/', LienParentEleveDetailView.as_view(), name='api-parents-lien-detail'),
    path('parents/rapports/', RapportParentalListView.as_view(), name='api-parents-rapports'),
    path('parents/rapports/generer/', RapportParentalGenerateView.as_view(), name='api-parents-rapports-generer'),

    # ── Matières ──────────────────────────────────────────────────────────────
    path('matieres/', MatiereListView.as_view(), name='api-matieres-list'),
    path('recherche/', RechercheGlobaleView.as_view(), name='api-recherche'),

    # ── Cours ─────────────────────────────────────────────────────────────────
    path('cours/', CoursListView.as_view(), name='api-cours-list'),
    path('cours/<uuid:id_cours>/', CoursDetailView.as_view(), name='api-cours-detail'),
    path('cours/<uuid:id_cours>/soumettre/', CoursSoumettreView.as_view(), name='api-cours-soumettre'),
    path('cours/<uuid:id_cours>/publier/', CoursPublierView.as_view(), name='api-cours-publier'),
    path('cours/<uuid:id_cours>/depublier/', CoursDepublierView.as_view(), name='api-cours-depublier'),

    # ── Épreuves ──────────────────────────────────────────────────────────────
    path('epreuves/', EpreuveListView.as_view(), name='api-epreuves-list'),
    path('epreuves/<uuid:id_epreuve>/', EpreuveDetailView.as_view(), name='api-epreuves-detail'),
    path('epreuves/<uuid:id_epreuve>/questions/', EpreuveQuestionsView.as_view(), name='api-epreuves-questions'),
    path('epreuves/importer-pdf/', EpreuveImportPDFView.as_view(), name='api-epreuves-import-pdf'),
    path('questions/<uuid:id_question>/assistant/', QuestionAssistantView.as_view(), name='api-question-assistant'),

    # ── Exercices adaptatifs générés par l'IA (Module 2) ──────────────────────
    path('exercices/generer/', ExerciceGenererView.as_view(), name='api-exercices-generer'),

    # ── Coach IA — conseil personnalisé (Module 10) ───────────────────────────
    path('coach/conseil/', CoachConseilView.as_view(), name='api-coach-conseil'),

    # ── Micro-leçons ciblées (Module 11) ──────────────────────────────────────
    path('lecons/', LeconListView.as_view(), name='api-lecons-list'),
    path('lecons/generer/', LeconGenererView.as_view(), name='api-lecons-generer'),
    path('lecons/<uuid:id_lecon>/lue/', LeconMarquerLueView.as_view(), name='api-lecons-lue'),

    # ── Sync hors-ligne ───────────────────────────────────────────────────────
    path('sync/', SyncView.as_view(), name='api-sync'),

    # ── Gamification ──────────────────────────────────────────────────────────
    path('gamification/xp/', XPView.as_view(), name='api-gamification-xp'),
    path('gamification/badges/', BadgeListView.as_view(), name='api-gamification-badges'),
    path('gamification/mes-badges/', MesBadgesView.as_view(), name='api-gamification-mes-badges'),
    path('gamification/leaderboard/', LeaderboardView.as_view(), name='api-gamification-leaderboard'),
    path('gamification/ligue/', LigueView.as_view(), name='api-gamification-ligue'),
    path('gamification/defis/', DefisListView.as_view(), name='api-gamification-defis'),
    path('gamification/defis/<str:code>/reclamer/', DefiReclamerView.as_view(), name='api-gamification-defi-reclamer'),

    # ── Micro-révisions quotidiennes ──────────────────────────────────────────
    path('revisions/du-jour/', RevisionDuJourView.as_view(), name='api-revisions-du-jour'),
    path('revisions/du-jour/completer/', RevisionCompleterView.as_view(), name='api-revisions-completer'),

    # ── Analytique & Suivi ────────────────────────────────────────────────────
    path('analytique/diagnostics/', DiagnosticListView.as_view(), name='api-analytique-diagnostics'),
    path('analytique/lacunes/', LacuneListView.as_view(), name='api-analytique-lacunes-list'),
    path('analytique/lacunes/detecter/', LacuneDetecterView.as_view(), name='api-analytique-lacunes-detecter'),
    path('analytique/lacunes/<uuid:id_lacune>/', LacuneDetailView.as_view(), name='api-analytique-lacunes-detail'),
    path('analytique/dashboard/', DashboardView.as_view(), name='api-analytique-dashboard'),

    # ── Sessions d'examen ─────────────────────────────────────────────────────
    path('sessions/', SessionHistoriqueView.as_view(), name='api-sessions-list'),
    path('sessions/<uuid:id_session>/', SessionDetailView.as_view(), name='api-sessions-detail'),
    path('sessions/<uuid:id_session>/reponses/', SessionReponsesView.as_view(), name='api-sessions-reponses'),
    path('sessions/<uuid:id_session>/terminer/', SessionTerminerView.as_view(), name='api-sessions-terminer'),
    path('sessions/<uuid:id_session>/correction/', SessionCorrectionView.as_view(), name='api-sessions-correction'),
    path('epreuves/<uuid:id_epreuve>/demarrer/', SessionDemarrerView.as_view(), name='api-sessions-demarrer'),

    # ── Notifications ─────────────────────────────────────────────────────────
    path('notifications/', NotificationListView.as_view(), name='api-notifications-list'),
    path('notifications/count/', NotificationCountView.as_view(), name='api-notifications-count'),
    path('notifications/read-all/', NotificationMarkAllReadView.as_view(), name='api-notifications-read-all'),
    path('notifications/<uuid:id_notification>/read/', NotificationMarkReadView.as_view(), name='api-notifications-read'),

    # ── Chatbot IA ────────────────────────────────────────────────────────────
    path('chatbot/message/', ChatbotMessageView.as_view(), name='api-chatbot-message'),
    path('chatbot/historique/', ChatbotHistoriqueView.as_view(), name='api-chatbot-historique'),
    path('chatbot/messages/<uuid:id_message>/feedback/', ChatbotFeedbackView.as_view(), name='api-chatbot-feedback'),

    # ── Sessions Focus (Pomodoro) ─────────────────────────────────────────────
    path('focus/', FocusListView.as_view(), name='api-focus-list'),
    path('focus/start/', FocusStartView.as_view(), name='api-focus-start'),
    path('focus/<uuid:id_focus>/stop/', FocusStopView.as_view(), name='api-focus-stop'),

    # ── Paiements & Abonnements ───────────────────────────────────────────────
    path('paiements/initier/', PaiementInitierView.as_view(), name='api-paiements-initier'),
    path('paiements/webhook/fapshi/', FapshiWebhookView.as_view(), name='api-paiements-webhook-fapshi'),
    path('paiements/<str:trans_id>/statut/', PaiementStatutView.as_view(), name='api-paiements-statut'),
    path('abonnements/', AbonnementListView.as_view(), name='api-abonnements-list'),
    path('abonnements/actif/', AbonnementActifView.as_view(), name='api-abonnements-actif'),

    # ── Planning d'étude ──────────────────────────────────────────────────────
    path('plannings/', PlanningListView.as_view(), name='api-plannings-list'),
    path('plannings/creer/', PlanningCreateView.as_view(), name='api-plannings-create'),
    path('plannings/actif/', PlanningActifView.as_view(), name='api-plannings-actif'),
    path('plannings/sessions/<uuid:id_session_etude>/completer/', SessionEtudeCompleterView.as_view(), name='api-plannings-session-completer'),

    # ── Orientation scolaire (Sprint 5) ───────────────────────────────────────────
    path('analytique/orientations/', OrientationListView.as_view(), name='api-orientations-list'),
    path('analytique/orientations/creer/', OrientationCreateView.as_view(), name='api-orientations-create'),
    path('analytique/orientations/test/', OrientationTestView.as_view(), name='api-orientations-test'),
    path('analytique/orientations/soumettre/', OrientationSoumettreView.as_view(), name='api-orientations-soumettre'),

    # ── Espace enseignant (Sprint 5) ──────────────────────────────────────────────
    path('enseignant/dashboard/', EnseignantDashboardView.as_view(), name='api-enseignant-dashboard'),
    path('enseignant/cours/', EnseignantCoursListView.as_view(), name='api-enseignant-cours'),
    path('enseignant/epreuves/', EnseignantEpreuvesListView.as_view(), name='api-enseignant-epreuves'),
    path('enseignant/epreuves/<uuid:id_epreuve>/', EnseignantEpreuveDetailView.as_view(), name='api-enseignant-epreuve-detail'),
    path('enseignant/exercices/', EnseignantExerciceCreateView.as_view(), name='api-enseignant-exercice-create'),
    path('enseignant/exercices/<uuid:id_epreuve>/questions/', EnseignantExerciceQuestionsView.as_view(), name='api-enseignant-exercice-questions'),
    path('enseignant/cours/<uuid:id_cours>/pdf/', CoursPdfUploadView.as_view(), name='api-enseignant-cours-pdf'),
    path('enseignant/epreuves/<uuid:id_epreuve>/pdf/', EpreuvePdfUploadView.as_view(), name='api-enseignant-epreuve-pdf'),
    path('enseignant/retours/', EnseignantRetoursView.as_view(), name='api-enseignant-retours'),

    # ── Avis & favoris (Phase 4) ──────────────────────────────────────────────────
    path('avis/', AvisView.as_view(), name='api-avis'),
    path('favoris/', FavorisListView.as_view(), name='api-favoris'),
    path('favoris/toggle/', FavoriToggleView.as_view(), name='api-favoris-toggle'),

    # ── Rapport PDF (Sprint 5) ────────────────────────────────────────────────────
    path('parents/rapports/<uuid:rapport_id>/pdf/', RapportPDFView.as_view(), name='api-parents-rapport-pdf'),

    # ── Atelier rédaction (Sprint 6) ──────────────────────────────────────────────
    path('redaction/analyser/', RedactionAnalyseView.as_view(), name='api-redaction-analyser'),

    # ── Préparation aux concours (Sprint 6) ───────────────────────────────────────
    path('concours/', ConcoursListView.as_view(), name='api-concours-list'),

    # ── Back-office super-admin (role='admin') ────────────────────────────────────
    path('admin/overview/', AdminOverviewView.as_view(), name='api-admin-overview'),
    path('admin/users/', AdminUsersView.as_view(), name='api-admin-users'),
    path('admin/users/<uuid:user_id>/', AdminUserDetailView.as_view(), name='api-admin-user-detail'),
    path('admin/moderation/', AdminModerationView.as_view(), name='api-admin-moderation'),
    path('admin/cours/<uuid:id_cours>/valider/', AdminCoursValiderView.as_view(), name='api-admin-cours-valider'),
    path('admin/cours/<uuid:id_cours>/rejeter/', AdminCoursRejeterView.as_view(), name='api-admin-cours-rejeter'),
    path('admin/abonnements/', AdminAbonnementsView.as_view(), name='api-admin-abonnements'),
    path('admin/abonnements/<uuid:id_abonnement>/', AdminAbonnementUpdateView.as_view(), name='api-admin-abonnement-update'),
    path('admin/finances/stats/', AdminFinanceStatsView.as_view(), name='api-admin-finances-stats'),
    path('admin/paiements/', AdminPaiementsView.as_view(), name='api-admin-paiements'),
    path('admin/paiements/<uuid:id_paiement>/action/', AdminPaiementActionView.as_view(), name='api-admin-paiement-action'),
    path('admin/remunerations/', AdminRemunerationsView.as_view(), name='api-admin-remunerations'),
    path('admin/remunerations/<uuid:id_remuneration>/payer/', AdminRemunerationPayerView.as_view(), name='api-admin-remun-payer'),
    path('admin/matieres/', AdminMatiereListCreateView.as_view(), name='api-admin-matieres'),
    path('admin/matieres/<uuid:id_matiere>/', AdminMatiereDetailView.as_view(), name='api-admin-matiere-detail'),
    path('admin/badges/', AdminBadgeListCreateView.as_view(), name='api-admin-badges'),
    path('admin/badges/<uuid:id_badge>/', AdminBadgeDetailView.as_view(), name='api-admin-badge-detail'),
    path('admin/defis/', AdminDefiListCreateView.as_view(), name='api-admin-defis'),
    path('admin/defis/<uuid:id_defi>/', AdminDefiDetailView.as_view(), name='api-admin-defi-detail'),
    path('admin/broadcast/', AdminBroadcastView.as_view(), name='api-admin-broadcast'),
    path('admin/audit/', AdminAuditView.as_view(), name='api-admin-audit'),
]
