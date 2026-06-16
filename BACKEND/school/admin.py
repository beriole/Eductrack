from django.contrib import admin
from .models import (
    Utilisateur, Eleves, Parents, Enseignants, Matieres, Abonnements,
    Paiements, Epreuves, Questions, SessionsExamen, Reponses,
    Diagnostics, Lacunes, PlanningsEtude, SessionsEtude,
    MessagesChatbot, Cours, Notifications, RapportsParentaux,
    Badges, EleveBadges, SessionsFocus, Orientations,
    RemunerationEnseignant, EleveParent, CodeLiaison,
    MicroLecons, MicroRevisions, Defis, EleveDefis, JournalAdmin,
)


@admin.register(Utilisateur)
class UtilisateurAdmin(admin.ModelAdmin):
    list_display = ('email', 'nom', 'prenom', 'role', 'actif', 'email_verifie', 'date_creation')
    list_filter = ('role', 'actif', 'langue')
    search_fields = ('email', 'nom', 'prenom', 'telephone')


@admin.register(Matieres)
class MatieresAdmin(admin.ModelAdmin):
    list_display = ('nom', 'code', 'langue', 'coefficient_max', 'actif')
    list_filter = ('actif', 'langue')
    search_fields = ('nom', 'code')


@admin.register(Eleves)
class ElevesAdmin(admin.ModelAdmin):
    list_display = ('email', 'nom', 'prenom', 'niveau_scolaire', 'serie', 'region', 'score_global', 'streak_jours')
    list_filter = ('niveau_scolaire', 'region', 'actif')
    search_fields = ('email', 'nom', 'prenom')


@admin.register(Parents)
class ParentsAdmin(admin.ModelAdmin):
    list_display = ('email', 'nom', 'prenom', 'frequence_rapport', 'seuil_alerte_jours')
    list_filter = ('frequence_rapport', 'notif_push_actives', 'notif_sms_actives')
    search_fields = ('email', 'nom', 'prenom')


@admin.register(Enseignants)
class EnseignantsAdmin(admin.ModelAdmin):
    list_display = ('email', 'nom', 'prenom', 'specialite', 'verifie', 'total_gains', 'nb_cours')
    list_filter = ('verifie', 'actif')
    search_fields = ('email', 'nom', 'prenom', 'specialite')


@admin.register(Abonnements)
class AbonnementsAdmin(admin.ModelAdmin):
    list_display = ('id_utilisateur', 'formule', 'montant', 'periodicite', 'date_debut', 'date_expiration', 'statut')
    list_filter = ('formule', 'periodicite', 'statut')
    search_fields = ('id_utilisateur__email',)


@admin.register(Paiements)
class PaiementsAdmin(admin.ModelAdmin):
    list_display = ('reference_transaction', 'id_utilisateur', 'montant', 'methode_paiement', 'statut', 'date_paiement')
    list_filter = ('methode_paiement', 'statut')
    search_fields = ('reference_transaction', 'id_utilisateur__email')


@admin.register(Epreuves)
class EpreuvesAdmin(admin.ModelAdmin):
    list_display = ('titre', 'id_matiere', 'type_epreuve', 'niveau', 'serie', 'duree_minutes', 'nb_questions', 'statut')
    list_filter = ('type_epreuve', 'niveau', 'statut', 'id_matiere')
    search_fields = ('titre',)


@admin.register(Questions)
class QuestionsAdmin(admin.ModelAdmin):
    list_display = ('id_epreuve', 'numero_ordre', 'type_question', 'difficulte', 'points')
    list_filter = ('type_question', 'difficulte')


@admin.register(SessionsExamen)
class SessionsExamenAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'id_epreuve', 'mode', 'statut', 'note_obtenue', 'date_debut')
    list_filter = ('mode', 'statut')
    search_fields = ('id_eleve__email',)


@admin.register(Reponses)
class ReponsesAdmin(admin.ModelAdmin):
    list_display = ('id_session', 'id_question', 'est_correcte', 'points_obtenus', 'horodatage')


@admin.register(Diagnostics)
class DiagnosticsAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'date_passage', 'score_global', 'parcours_genere', 'nb_lacunes_detectees')
    list_filter = ('parcours_genere',)


@admin.register(Lacunes)
class LacunesAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'id_matiere', 'chapitre', 'notion', 'taux_maitrise', 'statut')
    list_filter = ('statut', 'id_matiere')


@admin.register(PlanningsEtude)
class PlanningsEtudeAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'semaine_debut', 'actif', 'nb_sessions', 'date_generation')
    list_filter = ('actif',)


@admin.register(SessionsEtude)
class SessionsEtudeAdmin(admin.ModelAdmin):
    list_display = ('id_planning', 'id_matiere', 'date_heure', 'duree_minutes', 'completee', 'rappel_envoye')
    list_filter = ('completee', 'rappel_envoye')


@admin.register(MessagesChatbot)
class MessagesChatbotAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'role', 'contenu', 'horodatage')
    list_filter = ('role',)


@admin.register(Cours)
class CoursAdmin(admin.ModelAdmin):
    list_display = ('titre', 'id_enseignant', 'id_matiere', 'niveau', 'statut', 'nb_vues', 'valide')
    list_filter = ('statut', 'valide', 'niveau')


@admin.register(Notifications)
class NotificationsAdmin(admin.ModelAdmin):
    list_display = ('id_utilisateur', 'type_notif', 'titre', 'canal', 'lue', 'date_envoi')
    list_filter = ('type_notif', 'canal', 'lue')


@admin.register(RapportsParentaux)
class RapportsParentauxAdmin(admin.ModelAdmin):
    list_display = ('id_parent', 'id_eleve', 'periode_debut', 'periode_fin', 'envoye', 'date_generation')
    list_filter = ('envoye',)


@admin.register(Badges)
class BadgesAdmin(admin.ModelAdmin):
    list_display = ('nom', 'categorie', 'valeur_points', 'actif')
    list_filter = ('categorie', 'actif')


@admin.register(EleveBadges)
class EleveBadgesAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'id_badge', 'date_obtention', 'contexte')


@admin.register(SessionsFocus)
class SessionsFocusAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'duree_pomodoro_min', 'nb_sessions', 'temps_total_min', 'date_debut')
    list_filter = ('rapport_envoye_parent',)


@admin.register(Orientations)
class OrientationsAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'date_test', 'serie_recommandee', 'score_global_test')


@admin.register(RemunerationEnseignant)
class RemunerationEnseignantAdmin(admin.ModelAdmin):
    list_display = ('id_enseignant', 'periode_debut', 'periode_fin', 'montant_calcule', 'montant_verse', 'statut_paiement')
    list_filter = ('statut_paiement',)


@admin.register(EleveParent)
class EleveParentAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'id_parent', 'lien', 'date_liaison', 'actif')
    list_filter = ('lien', 'actif')


@admin.register(CodeLiaison)
class CodeLiaisonAdmin(admin.ModelAdmin):
    list_display = ('code', 'id_eleve', 'utilise', 'date_creation', 'date_expiration')
    list_filter = ('utilise',)
    search_fields = ('code', 'id_eleve__email')


@admin.register(MicroLecons)
class MicroLeconsAdmin(admin.ModelAdmin):
    list_display = ('titre', 'id_eleve', 'id_matiere', 'source', 'lue', 'date_creation')
    list_filter = ('source', 'lue')
    search_fields = ('titre', 'id_eleve__email')


@admin.register(MicroRevisions)
class MicroRevisionsAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'date_jour', 'completee', 'note', 'date_completion')
    list_filter = ('completee',)
    search_fields = ('id_eleve__email',)


@admin.register(Defis)
class DefisAdmin(admin.ModelAdmin):
    list_display = ('titre', 'code', 'type_cible', 'seuil', 'recompense_xp', 'periode', 'actif')
    list_filter = ('type_cible', 'periode', 'actif')
    search_fields = ('code', 'titre')


@admin.register(EleveDefis)
class EleveDefisAdmin(admin.ModelAdmin):
    list_display = ('id_eleve', 'id_defi', 'periode_cle', 'progression', 'complete', 'recompense_reclamee')
    list_filter = ('complete', 'recompense_reclamee')
    search_fields = ('id_eleve__email',)


@admin.register(JournalAdmin)
class JournalAdminAdmin(admin.ModelAdmin):
    list_display = ('action', 'id_admin', 'cible_type', 'cible_id', 'date')
    list_filter = ('action', 'cible_type')
    search_fields = ('id_admin__email', 'action', 'cible_id')
