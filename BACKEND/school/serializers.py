from rest_framework import serializers
from .models import (
    Utilisateur, Eleves, Parents, Enseignants, Matieres, Cours, Questions,
    Epreuves, Badges, EleveBadges, Diagnostics, Lacunes, RapportsParentaux,
    SessionsExamen, Reponses, Notifications, MessagesChatbot, SessionsFocus,
    Abonnements, Paiements, PlanningsEtude, SessionsEtude, Orientations,
    MicroLecons, Avis, Favori,
)
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.db.models import Avg


class FeedbackFieldsMixin(serializers.Serializer):
    """Ajoute note_moyenne / nb_avis / est_favori / mon_avis à un contenu (cours/épreuve).

    L'objet doit exposer les related_names `avis` et `favoris`. `est_favori` et
    `mon_avis` dépendent de l'élève courant (contexte `request`).
    """
    note_moyenne = serializers.SerializerMethodField()
    nb_avis = serializers.SerializerMethodField()
    est_favori = serializers.SerializerMethodField()
    mon_avis = serializers.SerializerMethodField()

    def _eleve_id(self):
        req = self.context.get('request')
        user = getattr(req, 'user', None)
        if user and user.is_authenticated and getattr(user, 'role', None) == 'eleve':
            return user.id_utilisateur
        return None

    def get_note_moyenne(self, obj):
        moy = obj.avis.aggregate(m=Avg('note'))['m']
        return round(moy, 1) if moy is not None else None

    def get_nb_avis(self, obj):
        return obj.avis.count()

    def get_est_favori(self, obj):
        eid = self._eleve_id()
        return bool(eid and obj.favoris.filter(id_eleve=eid).exists())

    def get_mon_avis(self, obj):
        eid = self._eleve_id()
        if not eid:
            return None
        a = obj.avis.filter(id_eleve=eid).first()
        return {'note': a.note, 'commentaire': a.commentaire} if a else None

class UtilisateurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Utilisateur
        fields = ['id_utilisateur', 'email', 'telephone', 'nom', 'prenom', 'role', 'langue', 'avatar_url', 'actif', 'email_verifie', 'date_creation']
        read_only_fields = ['id_utilisateur', 'actif', 'email_verifie', 'date_creation']

class EleveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Eleves
        fields = UtilisateurSerializer.Meta.fields + ['systeme', 'niveau_scolaire', 'serie', 'region', 'ville', 'etablissement', 'date_naissance', 'score_global', 'streak_jours', 'points_gamification', 'mode_hors_ligne', 'date_diagnostic']
        read_only_fields = UtilisateurSerializer.Meta.read_only_fields + ['score_global', 'streak_jours', 'points_gamification', 'date_diagnostic']

class ParentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parents
        fields = UtilisateurSerializer.Meta.fields + ['notif_push_actives', 'notif_sms_actives', 'notif_email_actives', 'frequence_rapport', 'seuil_alerte_jours']

class EnseignantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enseignants
        fields = UtilisateurSerializer.Meta.fields + ['specialite', 'diplome', 'etablissement', 'biographie', 'verifie', 'taux_remuneration', 'total_gains', 'nb_cours']
        read_only_fields = UtilisateurSerializer.Meta.read_only_fields + ['verifie', 'taux_remuneration', 'total_gains', 'nb_cours']

class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    nom = serializers.CharField()
    prenom = serializers.CharField()
    telephone = serializers.CharField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Utilisateur.ROLE_CHOICES)
    langue = serializers.ChoiceField(choices=Utilisateur.LANGUE_CHOICES, default='fr')
    
    # Eleve specific
    systeme = serializers.ChoiceField(choices=Eleves.SYSTEME_CHOICES, required=False, default='francophone')
    niveau_scolaire = serializers.ChoiceField(choices=Eleves.NIVEAU_CHOICES, required=False)
    serie = serializers.ChoiceField(choices=Eleves.SERIE_CHOICES, required=False, allow_blank=True)
    region = serializers.ChoiceField(choices=Eleves.REGION_CHOICES, required=False)

    def validate(self, attrs):
        if Utilisateur.objects.filter(email=attrs['email']).exists():
            raise serializers.ValidationError({"email": "Cet email est déjà utilisé."})
        if attrs.get('telephone') and Utilisateur.objects.filter(telephone=attrs['telephone']).exists():
            raise serializers.ValidationError({"telephone": "Ce numéro de téléphone est déjà utilisé."})
            
        role = attrs.get('role')
        if role == 'eleve':
            if not attrs.get('niveau_scolaire') or not attrs.get('region'):
                raise serializers.ValidationError("Le niveau scolaire et la région sont requis pour un élève.")
        return attrs

    def create(self, validated_data):
        role = validated_data.get('role')
        # Base user data
        user_data = {
            'email': validated_data['email'],
            'username': validated_data['email'], # Use email as username
            'nom': validated_data['nom'],
            'prenom': validated_data['prenom'],
            'telephone': validated_data.get('telephone'),
            'role': role,
            'langue': validated_data.get('langue', 'fr'),
        }

        if role == 'eleve':
            user = Eleves.objects.create_user(
                **user_data,
                password=validated_data['password'],
                systeme=validated_data.get('systeme', 'francophone'),
                niveau_scolaire=validated_data['niveau_scolaire'],
                serie=validated_data.get('serie', ''),
                region=validated_data['region']
            )
        elif role == 'parent':
            user = Parents.objects.create_user(
                **user_data,
                password=validated_data['password']
            )
        elif role == 'enseignant':
            user = Enseignants.objects.create_user(
                **user_data,
                password=validated_data['password'],
                specialite='Général' # default placeholder
            )
        else:
            user = Utilisateur.objects.create_user(
                **user_data,
                password=validated_data['password']
            )

        return user

class MatiereSerializer(serializers.ModelSerializer):
    class Meta:
        model = Matieres
        fields = '__all__'

class CoursSerializer(FeedbackFieldsMixin, serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True)
    matiere_code = serializers.CharField(source='id_matiere.code', read_only=True)
    enseignant_nom = serializers.SerializerMethodField()

    class Meta:
        model = Cours
        fields = '__all__'
        # id_enseignant et statut sont fixés par la vue (perform_create / soumettre),
        # jamais par le client → read-only pour ne pas être exigés à la création.
        read_only_fields = ['id_cours', 'id_enseignant', 'statut', 'nb_vues', 'valide',
                            'date_publication', 'date_creation']

    def get_enseignant_nom(self, obj):
        return f"{obj.id_enseignant.prenom} {obj.id_enseignant.nom}"

class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Questions
        fields = '__all__'


class QuestionExamSerializer(serializers.ModelSerializer):
    """Version « mode examen » : n'expose JAMAIS la réponse correcte ni
    l'explication tant que l'élève est en train de composer (anti-triche)."""
    class Meta:
        model = Questions
        fields = [
            'id_question', 'numero_ordre', 'enonce', 'type_question',
            'options', 'points', 'difficulte', 'image_url',
        ]

class EpreuveSerializer(FeedbackFieldsMixin, serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True)
    matiere_code = serializers.CharField(source='id_matiere.code', read_only=True)
    nb_questions_detail = serializers.SerializerMethodField()

    class Meta:
        model = Epreuves
        fields = '__all__'

    def get_nb_questions_detail(self, obj):
        return obj.questions.count()

    def to_representation(self, instance):
        """Anti-triche : le corrigé (texte + PDF) n'est exposé que si le contexte
        l'autorise (propriétaire enseignant, ou élève après composition)."""
        data = super().to_representation(instance)
        if not self.context.get('reveler_corrige'):
            data.pop('corrige', None)
            data.pop('corrige_pdf', None)
        return data


class AvisSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.SerializerMethodField()
    contenu_titre = serializers.SerializerMethodField()

    class Meta:
        model = Avis
        fields = ['id_avis', 'id_cours', 'id_epreuve', 'note', 'commentaire',
                  'eleve_nom', 'contenu_titre', 'date_creation']
        read_only_fields = ['id_avis', 'eleve_nom', 'contenu_titre', 'date_creation']

    def get_eleve_nom(self, obj):
        return f"{obj.id_eleve.prenom} {obj.id_eleve.nom}"

    def get_contenu_titre(self, obj):
        if obj.id_cours_id:
            return obj.id_cours.titre
        return obj.id_epreuve.titre if obj.id_epreuve_id else None


class FavoriSerializer(serializers.ModelSerializer):
    contenu_titre = serializers.SerializerMethodField()
    matiere_nom = serializers.SerializerMethodField()
    type_contenu = serializers.SerializerMethodField()

    class Meta:
        model = Favori
        fields = ['id_favori', 'id_cours', 'id_epreuve', 'type_contenu',
                  'contenu_titre', 'matiere_nom', 'date_creation']

    def get_type_contenu(self, obj):
        return 'cours' if obj.id_cours_id else 'epreuve'

    def get_contenu_titre(self, obj):
        return obj.id_cours.titre if obj.id_cours_id else (obj.id_epreuve.titre if obj.id_epreuve_id else None)

    def get_matiere_nom(self, obj):
        cible = obj.id_cours or obj.id_epreuve
        return cible.id_matiere.nom if cible else None


class BadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Badges
        fields = '__all__'

class EleveBadgeSerializer(serializers.ModelSerializer):
    badge_nom = serializers.CharField(source='id_badge.nom', read_only=True)
    badge_icone = serializers.CharField(source='id_badge.icone_url', read_only=True)

    class Meta:
        model = EleveBadges
        fields = '__all__'

class LacuneSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True)
    
    class Meta:
        model = Lacunes
        fields = '__all__'

class DiagnosticSerializer(serializers.ModelSerializer):
    class Meta:
        model = Diagnostics
        fields = '__all__'
        read_only_fields = ['id_diagnostic', 'id_eleve', 'date_passage']

class MicroLeconSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True)
    notion = serializers.CharField(source='id_lacune.notion', read_only=True, default=None)

    class Meta:
        model = MicroLecons
        fields = '__all__'
        read_only_fields = ['id_lecon', 'id_eleve', 'source', 'date_creation']

class RapportParentalSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.SerializerMethodField()

    class Meta:
        model = RapportsParentaux
        fields = '__all__'

    def get_eleve_nom(self, obj):
        return f"{obj.id_eleve.prenom} {obj.id_eleve.nom}"


# ─── Sprint 1 Serializers ─────────────────────────────────────────────────────

class EmailVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(min_length=6, max_length=6)


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        if not Utilisateur.objects.filter(email=value).exists():
            # Ne pas révéler si l'email existe (sécurité)
            return value
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate(self, attrs):
        stored_otp = cache.get(f"otp_reset_{attrs['email']}")
        if not stored_otp or stored_otp != attrs['otp']:
            raise serializers.ValidationError({"otp": "Code invalide ou expiré."})
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return value

    def validate(self, attrs):
        if attrs['old_password'] == attrs['new_password']:
            raise serializers.ValidationError({"new_password": "Le nouveau mot de passe doit être différent de l'ancien."})
        return attrs


# ─── Sprint 2 Serializers ─────────────────────────────────────────────────────

class ReponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reponses
        fields = ['id_reponse', 'id_question', 'contenu_reponse', 'est_correcte', 'points_obtenus', 'temps_reponse_sec']
        read_only_fields = ['id_reponse', 'est_correcte', 'points_obtenus']


class ReponseSubmitSerializer(serializers.Serializer):
    id_question = serializers.UUIDField()
    contenu_reponse = serializers.CharField(allow_blank=True)
    temps_reponse_sec = serializers.IntegerField(required=False, min_value=0)


class SessionExamenSerializer(serializers.ModelSerializer):
    epreuve_titre = serializers.CharField(source='id_epreuve.titre', read_only=True)
    epreuve_matiere = serializers.CharField(source='id_epreuve.id_matiere.nom', read_only=True)
    nb_reponses = serializers.SerializerMethodField()

    class Meta:
        model = SessionsExamen
        fields = [
            'id_session', 'id_epreuve', 'epreuve_titre', 'epreuve_matiere',
            'mode', 'statut', 'date_debut', 'date_fin', 'duree_reelle_sec',
            'note_obtenue', 'nb_questions', 'nb_bonnes_reponses', 'nb_reponses',
        ]
        read_only_fields = [
            'id_session', 'statut', 'date_debut', 'date_fin',
            'duree_reelle_sec', 'note_obtenue', 'nb_questions', 'nb_bonnes_reponses',
        ]

    def get_nb_reponses(self, obj):
        return obj.reponses.count()


class SessionResultatSerializer(serializers.ModelSerializer):
    reponses = ReponseSerializer(many=True, read_only=True)
    epreuve_titre = serializers.CharField(source='id_epreuve.titre', read_only=True)

    class Meta:
        model = SessionsExamen
        fields = [
            'id_session', 'epreuve_titre', 'mode', 'statut',
            'date_debut', 'date_fin', 'duree_reelle_sec',
            'note_obtenue', 'nb_questions', 'nb_bonnes_reponses', 'reponses',
        ]


# ─── Sprint 3 Serializers ─────────────────────────────────────────────────────

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notifications
        fields = [
            'id_notification', 'type_notif', 'titre', 'message',
            'canal', 'lue', 'date_envoi', 'date_lecture', 'metadata',
        ]
        read_only_fields = ['id_notification', 'date_envoi']


class MessageChatbotSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True, default=None)

    class Meta:
        model = MessagesChatbot
        fields = [
            'id_message', 'role', 'contenu', 'matiere_nom',
            'session_chat', 'nb_tokens', 'horodatage',
        ]
        read_only_fields = ['id_message', 'horodatage']


class SessionFocusSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True, default=None)

    class Meta:
        model = SessionsFocus
        fields = [
            'id_focus', 'duree_pomodoro_min', 'nb_sessions',
            'temps_total_min', 'matiere_nom', 'date_debut', 'date_fin',
        ]
        read_only_fields = ['id_focus', 'date_debut']


# ─── Sprint 4 Serializers ─────────────────────────────────────────────────────

class AbonnementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Abonnements
        fields = [
            'id_abonnement', 'formule', 'montant', 'periodicite',
            'date_debut', 'date_expiration', 'renouvellement_auto', 'statut', 'date_creation',
        ]
        read_only_fields = ['id_abonnement', 'date_creation']


class PaiementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paiements
        fields = [
            'id_paiement', 'montant', 'methode_paiement', 'operateur',
            'reference_transaction', 'statut', 'date_paiement', 'date_confirmation',
        ]
        read_only_fields = ['id_paiement', 'date_paiement']


class SessionEtudeSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True)
    matiere_code = serializers.CharField(source='id_matiere.code', read_only=True)

    class Meta:
        model = SessionsEtude
        fields = [
            'id_session_etude', 'matiere_nom', 'matiere_code',
            'date_heure', 'duree_minutes', 'objectif', 'completee', 'rappel_envoye',
        ]
        read_only_fields = ['id_session_etude']


class PlanningEtudeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanningsEtude
        fields = [
            'id_planning', 'semaine_debut', 'disponibilites',
            'priorites_matieres', 'actif', 'date_generation', 'nb_sessions',
        ]
        read_only_fields = ['id_planning', 'date_generation', 'nb_sessions']


# ─── Sprint 5 Serializers ─────────────────────────────────────────────────────

class OrientationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Orientations
        fields = [
            'id_orientation', 'date_test', 'aptitudes_detectees',
            'serie_recommandee', 'metiers_recommandes', 'filieres_superieures',
            'score_global_test', 'reponses_test',
        ]
        read_only_fields = ['id_orientation', 'date_test']

