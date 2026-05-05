from rest_framework import serializers
from .models import Utilisateur, Eleves, Parents, Enseignants, Matieres, Cours, Questions, Epreuves, Badges, EleveBadges, Diagnostics, Lacunes, RapportsParentaux
from django.contrib.auth.password_validation import validate_password

class UtilisateurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Utilisateur
        fields = ['id_utilisateur', 'email', 'telephone', 'nom', 'prenom', 'role', 'langue', 'avatar_url', 'actif', 'email_verifie', 'date_creation']
        read_only_fields = ['id_utilisateur', 'actif', 'email_verifie', 'date_creation']

class EleveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Eleves
        fields = UtilisateurSerializer.Meta.fields + ['niveau_scolaire', 'serie', 'region', 'ville', 'etablissement', 'date_naissance', 'score_global', 'streak_jours', 'points_gamification', 'mode_hors_ligne', 'date_diagnostic']
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

class CoursSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True)
    enseignant_nom = serializers.SerializerMethodField()

    class Meta:
        model = Cours
        fields = '__all__'
        read_only_fields = ['id_cours', 'nb_vues', 'valide', 'date_publication', 'date_creation']

    def get_enseignant_nom(self, obj):
        return f"{obj.id_enseignant.prenom} {obj.id_enseignant.nom}"

class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Questions
        fields = '__all__'

class EpreuveSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='id_matiere.nom', read_only=True)
    nb_questions_detail = serializers.SerializerMethodField()

    class Meta:
        model = Epreuves
        fields = '__all__'

    def get_nb_questions_detail(self, obj):
        return obj.questions.count()

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

class RapportParentalSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.SerializerMethodField()

    class Meta:
        model = RapportsParentaux
        fields = '__all__'

    def get_eleve_nom(self, obj):
        return f"{obj.id_eleve.prenom} {obj.id_eleve.nom}"

