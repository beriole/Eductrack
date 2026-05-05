from django.urls import path
from school.api_views.auth_views import RegisterView, LoginView, LogoutView
from school.api_views.user_views import UserMeView, UserAvatarUploadView
from school.api_views.parent_views import LierEnfantView, EnfantsListView, LienParentEleveDetailView, RapportParentalListView, RapportParentalGenerateView
from school.api_views.matiere_views import MatiereListView
from school.api_views.cours_views import CoursListView, CoursDetailView, CoursSoumettreView
from school.api_views.epreuve_views import EpreuveListView, EpreuveDetailView, EpreuveQuestionsView
from school.api_views.sync_views import SyncView
from school.api_views.gamification_views import XPView, BadgeListView, MesBadgesView, LeaderboardView
from school.api_views.analytique_views import DiagnosticListView, LacuneListView, LacuneDetailView, DashboardView
from rest_framework_simplejwt.views import TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # Swagger docs
    path('docs/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # Auth
    path('auth/register/', RegisterView.as_view(), name='api-register'),
    path('auth/login/', LoginView.as_view(), name='api-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='api-refresh'),
    path('auth/logout/', LogoutView.as_view(), name='api-logout'),

    # Users
    path('users/me/', UserMeView.as_view(), name='api-users-me'),
    path('users/me/avatar/', UserAvatarUploadView.as_view(), name='api-users-avatar'),

    # Parents
    path('parents/lier/', LierEnfantView.as_view(), name='api-parents-lier'),
    path('parents/enfants/', EnfantsListView.as_view(), name='api-parents-enfants'),
    path('parents/lien/<uuid:enfant_id>/', LienParentEleveDetailView.as_view(), name='api-parents-lien-detail'),
    path('parents/rapports/', RapportParentalListView.as_view(), name='api-parents-rapports'),
    path('parents/rapports/generer/', RapportParentalGenerateView.as_view(), name='api-parents-rapports-generer'),

    # Matieres
    path('matieres/', MatiereListView.as_view(), name='api-matieres-list'),

    # Cours
    path('cours/', CoursListView.as_view(), name='api-cours-list'),
    path('cours/<uuid:id_cours>/', CoursDetailView.as_view(), name='api-cours-detail'),
    path('cours/<uuid:id_cours>/soumettre/', CoursSoumettreView.as_view(), name='api-cours-soumettre'),

    # Epreuves
    path('epreuves/', EpreuveListView.as_view(), name='api-epreuves-list'),
    path('epreuves/<uuid:id_epreuve>/', EpreuveDetailView.as_view(), name='api-epreuves-detail'),
    path('epreuves/<uuid:id_epreuve>/questions/', EpreuveQuestionsView.as_view(), name='api-epreuves-questions'),

    # Sync
    path('sync/', SyncView.as_view(), name='api-sync'),

    # Gamification
    path('gamification/xp/', XPView.as_view(), name='api-gamification-xp'),
    path('gamification/badges/', BadgeListView.as_view(), name='api-gamification-badges'),
    path('gamification/mes-badges/', MesBadgesView.as_view(), name='api-gamification-mes-badges'),
    path('gamification/leaderboard/', LeaderboardView.as_view(), name='api-gamification-leaderboard'),

    # Analytique & Suivi
    path('analytique/diagnostics/', DiagnosticListView.as_view(), name='api-analytique-diagnostics'),
    path('analytique/lacunes/', LacuneListView.as_view(), name='api-analytique-lacunes-list'),
    path('analytique/lacunes/<uuid:id_lacune>/', LacuneDetailView.as_view(), name='api-analytique-lacunes-detail'),
    path('analytique/dashboard/', DashboardView.as_view(), name='api-analytique-dashboard'),
]
