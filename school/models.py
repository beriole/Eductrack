import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError


def validate_email_format(value):
    import re
    pattern = r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    if not re.match(pattern, value):
        raise ValidationError('Format d\'email invalide')


class Utilisateur(AbstractUser):
    ROLE_CHOICES = [
        ('eleve', 'Élève'),
        ('parent', 'Parent'),
        ('enseignant', 'Enseignant'),
        ('admin', 'Administrateur'),
    ]
    LANGUE_CHOICES = [
        ('fr', 'Français'),
        ('en', 'English'),
    ]

    id_utilisateur = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=80, blank=True)
    prenom = models.CharField(max_length=80, blank=True)
    email = models.EmailField(unique=True, validators=[validate_email_format])
    telephone = models.CharField(max_length=20, unique=True, blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='eleve')
    langue = models.CharField(max_length=2, choices=LANGUE_CHOICES, default='fr')
    avatar_url = models.URLField(max_length=500, blank=True, null=True)
    actif = models.BooleanField(default=True)
    email_verifie = models.BooleanField(default=False)
    token_reset = models.CharField(max_length=255, blank=True, null=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    derniere_connexion = models.DateTimeField(blank=True, null=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'utilisateurs'
        verbose_name = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'

    def __str__(self):
        return f"{self.prenom} {self.nom}" if self.prenom else self.email


class Matieres(models.Model):
    LANGUE_CHOICES = [
        ('fr', 'Français'),
        ('en', 'English'),
        ('fr_en', 'Bilingue'),
    ]

    id_matiere = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=10, unique=True)
    langue = models.CharField(max_length=5, choices=LANGUE_CHOICES, default='fr')
    niveaux = models.JSONField(default=list)
    series = models.JSONField(default=list, blank=True)
    coefficient_max = models.PositiveSmallIntegerField(default=1)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = 'matieres'
        verbose_name = 'Matière'
        verbose_name_plural = 'Matières'

    def __str__(self):
        return f"{self.nom} ({self.code})"


class Eleves(Utilisateur):
    NIVEAU_CHOICES = [
        ('6e', '6ème'),
        ('5e', '5ème'),
        ('4e', '4ème'),
        ('3e', '3ème'),
        ('2nde', 'Seconde'),
        ('1ere', 'Première'),
        ('Tle', 'Terminale'),
        ('Univ', 'Université'),
    ]
    SERIE_CHOICES = [
        ('A1', 'A1'),
        ('A4', 'A4'),
        ('C', 'C'),
        ('D', 'D'),
        ('E', 'E'),
        ('TI', 'TI'),
        ('G', 'G'),
    ]
    REGION_CHOICES = [
        ('Adamaoua', 'Adamaoua'),
        ('Centre', 'Centre'),
        ('Est', 'Est'),
        ('Extrême-Nord', 'Extrême-Nord'),
        ('Littoral', 'Littoral'),
        ('Nord', 'Nord'),
        ('Nord-Ouest', 'Nord-Ouest'),
        ('Ouest', 'Ouest'),
        ('Sud', 'Sud'),
        ('Sud-Ouest', 'Sud-Ouest'),
    ]

    niveau_scolaire = models.CharField(max_length=10, choices=NIVEAU_CHOICES)
    serie = models.CharField(max_length=10, choices=SERIE_CHOICES, blank=True, null=True)
    region = models.CharField(max_length=50, choices=REGION_CHOICES)
    ville = models.CharField(max_length=80, blank=True, null=True)
    etablissement = models.CharField(max_length=150, blank=True, null=True)
    date_naissance = models.DateField(blank=True, null=True)
    score_global = models.PositiveSmallIntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(100)])
    streak_jours = models.PositiveSmallIntegerField(default=0)
    points_gamification = models.PositiveIntegerField(default=0)
    mode_hors_ligne = models.BooleanField(default=False)
    date_diagnostic = models.DateField(blank=True, null=True)

    class Meta:
        db_table = 'eleves'
        verbose_name = 'Élève'
        verbose_name_plural = 'Élèves'

    def __str__(self):
        return f"{self.prenom} {self.nom}"


class Parents(Utilisateur):
    FREQUENCE_CHOICES = [
        ('daily', 'Quotidien'),
        ('hebdo', 'Hebdomadaire'),
        ('mensuel', 'Mensuel'),
    ]

    notif_push_actives = models.BooleanField(default=True)
    notif_sms_actives = models.BooleanField(default=False)
    notif_email_actives = models.BooleanField(default=True)
    frequence_rapport = models.CharField(max_length=10, choices=FREQUENCE_CHOICES, default='hebdo')
    seuil_alerte_jours = models.PositiveSmallIntegerField(default=3, validators=[MinValueValidator(1), MaxValueValidator(30)])

    class Meta:
        db_table = 'parents'
        verbose_name = 'Parent'
        verbose_name_plural = 'Parents'

    def __str__(self):
        return f"{self.prenom} {self.nom}"


class Enseignants(Utilisateur):
    specialite = models.CharField(max_length=100)
    diplome = models.CharField(max_length=100, blank=True, null=True)
    etablissement = models.CharField(max_length=150, blank=True, null=True)
    biographie = models.TextField(blank=True, null=True)
    verifie = models.BooleanField(default=False)
    taux_remuneration = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, validators=[MinValueValidator(0), MaxValueValidator(100)])
    total_gains = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    nb_cours = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'enseignants'
        verbose_name = 'Enseignant'
        verbose_name_plural = 'Enseignants'

    def __str__(self):
        return f"{self.prenom} {self.nom}"


class Abonnements(models.Model):
    FORMULE_CHOICES = [
        ('basic', 'Basic'),
        ('standard', 'Standard'),
        ('premium', 'Premium'),
        ('pro', 'Pro'),
    ]
    PERIODICITE_CHOICES = [
        ('mensuel', 'Mensuel'),
        ('trimestriel', 'Trimestriel'),
        ('annuel', 'Annuel'),
    ]
    STATUT_CHOICES = [
        ('actif', 'Actif'),
        ('expire', 'Expiré'),
        ('resilie', 'Résilié'),
        ('suspendu', 'Suspendu'),
    ]

    id_abonnement = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_utilisateur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='abonnements')
    formule = models.CharField(max_length=20, choices=FORMULE_CHOICES, default='basic')
    montant = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    periodicite = models.CharField(max_length=20, choices=PERIODICITE_CHOICES, default='mensuel')
    date_debut = models.DateField()
    date_expiration = models.DateField()
    renouvellement_auto = models.BooleanField(default=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='actif')
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'abonnements'
        verbose_name = 'Abonnement'
        verbose_name_plural = 'Abonnements'

    def __str__(self):
        return f"{self.id_utilisateur.email} - {self.formule}"

    def clean(self):
        if self.date_expiration <= self.date_debut:
            raise ValidationError('La date d\'expiration doit être postérieure à la date de début')


class Paiements(models.Model):
    METHODE_CHOICES = [
        ('mtn_momo', 'MTN Mobile Money'),
        ('orange_money', 'Orange Money'),
        ('carte', 'Carte bancaire'),
    ]
    STATUT_CHOICES = [
        ('en_attente', 'En attente'),
        ('confirme', 'Confirmé'),
        ('echoue', 'Échoué'),
        ('rembourse', 'Remboursé'),
    ]

    id_paiement = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_abonnement = models.ForeignKey(Abonnements, on_delete=models.RESTRICT, related_name='paiements')
    id_utilisateur = models.ForeignKey(Utilisateur, on_delete=models.RESTRICT, related_name='paiements')
    montant = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    methode_paiement = models.CharField(max_length=20, choices=METHODE_CHOICES)
    operateur = models.CharField(max_length=50, blank=True, null=True)
    reference_transaction = models.CharField(max_length=100, unique=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='en_attente')
    date_paiement = models.DateTimeField(auto_now_add=True)
    date_confirmation = models.DateTimeField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'paiements'
        verbose_name = 'Paiement'
        verbose_name_plural = 'Paiements'

    def __str__(self):
        return f"{self.reference_transaction} - {self.montant} FCFA"


class Epreuves(models.Model):
    TYPE_CHOICES = [
        ('officielle', 'Officielle'),
        ('simulation', 'Simulation'),
        ('exercice', 'Exercice'),
    ]
    STATUT_CHOICES = [
        ('actif', 'Actif'),
        ('archive', 'Archivé'),
        ('brouillon', 'Brouillon'),
    ]
    SOURCE_CHOICES = [
        ('OBC', 'OBC'),
        ('GCE_BOARD', 'GCE Board'),
        ('ENS', 'ENS'),
        ('MINESEC', 'MINESEC'),
        ('custom', 'Personnalisé'),
    ]
    NIVEAU_CHOICES = Eleves.NIVEAU_CHOICES
    SERIE_CHOICES = Eleves.SERIE_CHOICES
    LANGUE_CHOICES = [
        ('fr', 'Français'),
        ('en', 'English'),
    ]

    id_epreuve = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_matiere = models.ForeignKey(Matieres, on_delete=models.RESTRICT, related_name='epreuves')
    id_enseignant = models.ForeignKey(Enseignants, on_delete=models.SET_NULL, null=True, blank=True, related_name='epreuves')
    titre = models.CharField(max_length=200)
    type_epreuve = models.CharField(max_length=20, choices=TYPE_CHOICES)
    niveau = models.CharField(max_length=10, choices=NIVEAU_CHOICES)
    serie = models.CharField(max_length=10, choices=SERIE_CHOICES, blank=True, null=True)
    annee = models.PositiveSmallIntegerField(blank=True, null=True)
    source = models.CharField(max_length=50, choices=SOURCE_CHOICES, blank=True, null=True)
    duree_minutes = models.PositiveSmallIntegerField(default=120)
    langue = models.CharField(max_length=2, choices=LANGUE_CHOICES, default='fr')
    nb_questions = models.PositiveSmallIntegerField(default=0)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='actif')
    date_ajout = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'epreuves'
        verbose_name = 'Épreuve'
        verbose_name_plural = 'Épreuves'

    def __str__(self):
        return f"{self.titre} - {self.id_matiere.code}"


class Questions(models.Model):
    TYPE_CHOICES = [
        ('qcm', 'QCM'),
        ('vrai_faux', 'Vrai/Faux'),
        ('reponse_courte', 'Réponse courte'),
        ('redaction', 'Rédaction'),
    ]
    DIFFICULTE_CHOICES = [
        ('facile', 'Facile'),
        ('moyen', 'Moyen'),
        ('difficile', 'Difficile'),
    ]

    id_question = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_epreuve = models.ForeignKey(Epreuves, on_delete=models.CASCADE, related_name='questions')
    numero_ordre = models.PositiveSmallIntegerField()
    enonce = models.TextField()
    type_question = models.CharField(max_length=20, choices=TYPE_CHOICES)
    options = models.JSONField(default=list, blank=True)
    reponse_correcte = models.TextField(blank=True, null=True)
    points = models.DecimalField(max_digits=4, decimal_places=1, default=1.0, validators=[MinValueValidator(0)])
    explication = models.TextField(blank=True, null=True)
    difficulte = models.CharField(max_length=20, choices=DIFFICULTE_CHOICES, default='moyen')
    image_url = models.URLField(max_length=500, blank=True, null=True)

    class Meta:
        db_table = 'questions'
        verbose_name = 'Question'
        verbose_name_plural = 'Questions'
        constraints = [
            models.UniqueConstraint(fields=['id_epreuve', 'numero_ordre'], name='uq_question_ordre')
        ]

    def __str__(self):
        return f"Q{self.numero_ordre} - {self.enonce[:50]}"


class SessionsExamen(models.Model):
    MODE_CHOICES = [
        ('exercice', 'Exercice'),
        ('simulation', 'Simulation'),
        ('examen_blanc', 'Examen blanc'),
    ]
    STATUT_CHOICES = [
        ('en_cours', 'En cours'),
        ('termine', 'Terminé'),
        ('abandonne', 'Abandonné'),
    ]

    id_session = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='sessions_examen')
    id_epreuve = models.ForeignKey(Epreuves, on_delete=models.RESTRICT, related_name='sessions')
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='exercice')
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='en_cours')
    date_debut = models.DateTimeField(auto_now_add=True)
    date_fin = models.DateTimeField(blank=True, null=True)
    duree_reelle_sec = models.PositiveIntegerField(blank=True, null=True)
    note_obtenue = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    nb_questions = models.PositiveSmallIntegerField(default=0)
    nb_bonnes_reponses = models.PositiveSmallIntegerField(default=0)
    aide_utilisee = models.BooleanField(default=False)

    class Meta:
        db_table = 'sessions_examen'
        verbose_name = 'Session d\'examen'
        verbose_name_plural = 'Sessions d\'examen'

    def __str__(self):
        return f"Session {self.id_session} - {self.id_eleve}"


class Reponses(models.Model):
    id_reponse = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_session = models.ForeignKey(SessionsExamen, on_delete=models.CASCADE, related_name='reponses')
    id_question = models.ForeignKey(Questions, on_delete=models.CASCADE, related_name='reponses')
    contenu_reponse = models.TextField(blank=True, null=True)
    est_correcte = models.BooleanField(blank=True, null=True)
    points_obtenus = models.DecimalField(max_digits=4, decimal_places=1, blank=True, null=True)
    temps_reponse_sec = models.PositiveSmallIntegerField(blank=True, null=True)
    horodatage = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reponses'
        verbose_name = 'Réponse'
        verbose_name_plural = 'Réponses'
        constraints = [
            models.UniqueConstraint(fields=['id_session', 'id_question'], name='uq_reponse_unique')
        ]

    def __str__(self):
        return f"Réponse à {self.id_question}"


class Diagnostics(models.Model):
    id_diagnostic = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='diagnostics')
    date_passage = models.DateTimeField(auto_now_add=True)
    score_global = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, validators=[MinValueValidator(0), MaxValueValidator(100)])
    scores_par_matiere = models.JSONField(default=dict)
    matieres_testees = models.JSONField(default=list)
    parcours_genere = models.BooleanField(default=False)
    nb_lacunes_detectees = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'diagnostics'
        verbose_name = 'Diagnostic'
        verbose_name_plural = 'Diagnostics'

    def __str__(self):
        return f"Diagnostic {self.id_eleve} - {self.date_passage.date()}"


class Lacunes(models.Model):
    STATUT_CHOICES = [
        ('detectee', 'Détectée'),
        ('en_cours', 'En cours'),
        ('maitrisee', 'Maîtrisée'),
    ]

    id_lacune = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='lacunes')
    id_matiere = models.ForeignKey(Matieres, on_delete=models.RESTRICT, related_name='lacunes')
    id_diagnostic = models.ForeignKey(Diagnostics, on_delete=models.SET_NULL, null=True, blank=True, related_name='lacunes')
    chapitre = models.CharField(max_length=150)
    notion = models.CharField(max_length=200)
    taux_maitrise = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, validators=[MinValueValidator(0), MaxValueValidator(100)])
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='detectee')
    nb_exercices_faits = models.PositiveSmallIntegerField(default=0)
    date_detection = models.DateTimeField(auto_now_add=True)
    date_maitrise = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'lacunes'
        verbose_name = 'Lacune'
        verbose_name_plural = 'Lacunes'

    def __str__(self):
        return f"{self.notion} - {self.id_eleve}"


class PlanningsEtude(models.Model):
    id_planning = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='plannings')
    semaine_debut = models.DateField()
    disponibilites = models.JSONField(default=dict)
    priorites_matieres = models.JSONField(default=list, blank=True)
    actif = models.BooleanField(default=True)
    date_generation = models.DateTimeField(auto_now_add=True)
    nb_sessions = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'plannings_etude'
        verbose_name = 'Planning d\'étude'
        verbose_name_plural = 'Plannings d\'étude'

    def __str__(self):
        return f"Planning {self.id_eleve} - Semaine du {self.semaine_debut}"


class SessionsEtude(models.Model):
    id_session_etude = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_planning = models.ForeignKey(PlanningsEtude, on_delete=models.CASCADE, related_name='sessions')
    id_matiere = models.ForeignKey(Matieres, on_delete=models.RESTRICT, related_name='sessions_etude')
    date_heure = models.DateTimeField()
    duree_minutes = models.PositiveSmallIntegerField(default=60, validators=[MinValueValidator(15), MaxValueValidator(480)])
    objectif = models.CharField(max_length=200, blank=True, null=True)
    completee = models.BooleanField(default=False)
    rappel_envoye = models.BooleanField(default=False)

    class Meta:
        db_table = 'sessions_etude'
        verbose_name = 'Session d\'étude'
        verbose_name_plural = 'Sessions d\'étude'

    def __str__(self):
        return f"Session {self.id_matiere} - {self.date_heure.date()}"


class MessagesChatbot(models.Model):
    ROLE_CHOICES = [
        ('user', 'Utilisateur'),
        ('assistant', 'Assistant'),
    ]

    id_message = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='messages_chatbot')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    contenu = models.TextField()
    id_matiere = models.ForeignKey(Matieres, on_delete=models.SET_NULL, null=True, blank=True, related_name='messages_chatbot')
    session_chat = models.UUIDField(blank=True, null=True)
    nb_tokens = models.PositiveIntegerField(blank=True, null=True)
    horodatage = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'messages_chatbot'
        verbose_name = 'Message Chatbot'
        verbose_name_plural = 'Messages Chatbot'
        ordering = ['horodatage']

    def __str__(self):
        return f"{self.role} - {self.horodatage}"


class Cours(models.Model):
    STATUT_CHOICES = [
        ('brouillon', 'Brouillon'),
        ('publie', 'Publié'),
        ('archive', 'Archivé'),
    ]
    NIVEAU_CHOICES = Eleves.NIVEAU_CHOICES
    SERIE_CHOICES = Eleves.SERIE_CHOICES
    LANGUE_CHOICES = [
        ('fr', 'Français'),
        ('en', 'English'),
    ]

    id_cours = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_enseignant = models.ForeignKey(Enseignants, on_delete=models.RESTRICT, related_name='cours')
    id_matiere = models.ForeignKey(Matieres, on_delete=models.RESTRICT, related_name='cours')
    titre = models.CharField(max_length=200)
    contenu = models.TextField()
    niveau = models.CharField(max_length=10, choices=NIVEAU_CHOICES)
    serie = models.CharField(max_length=10, choices=SERIE_CHOICES, blank=True, null=True)
    langue = models.CharField(max_length=2, choices=LANGUE_CHOICES, default='fr')
    nb_vues = models.PositiveIntegerField(default=0)
    valide = models.BooleanField(default=False)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='brouillon')
    date_publication = models.DateTimeField(blank=True, null=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cours'
        verbose_name = 'Cours'
        verbose_name_plural = 'Cours'

    def __str__(self):
        return f"{self.titre} - {self.id_enseignant}"


class Notifications(models.Model):
    TYPE_CHOICES = [
        ('rappel', 'Rappel'),
        ('rapport', 'Rapport'),
        ('badge', 'Badge'),
        ('alerte', 'Alerte'),
        ('promo', 'Promotion'),
    ]
    CANAL_CHOICES = [
        ('push', 'Push'),
        ('sms', 'SMS'),
        ('email', 'Email'),
    ]

    id_notification = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_utilisateur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='notifications')
    type_notif = models.CharField(max_length=20, choices=TYPE_CHOICES)
    titre = models.CharField(max_length=150)
    message = models.TextField()
    canal = models.CharField(max_length=10, choices=CANAL_CHOICES, default='push')
    lue = models.BooleanField(default=False)
    date_envoi = models.DateTimeField(auto_now_add=True)
    date_lecture = models.DateTimeField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'notifications'
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-date_envoi']

    def __str__(self):
        return f"{self.titre} - {self.id_utilisateur}"


class RapportsParentaux(models.Model):
    id_rapport = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_parent = models.ForeignKey(Parents, on_delete=models.CASCADE, related_name='rapports')
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='rapports_parentaux')
    periode_debut = models.DateField()
    periode_fin = models.DateField()
    moyenne_globale = models.DecimalField(max_digits=4, decimal_places=2, blank=True, null=True)
    temps_etude_total = models.PositiveIntegerField(default=0)
    nb_sessions = models.PositiveSmallIntegerField(default=0)
    matieres_travaillees = models.JSONField(default=list, blank=True)
    lacunes_principales = models.JSONField(default=list, blank=True)
    envoye = models.BooleanField(default=False)
    date_generation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'rapports_parentaux'
        verbose_name = 'Rapport parental'
        verbose_name_plural = 'Rapports parentaux'

    def __str__(self):
        return f"Rapport {self.id_eleve} - {self.periode_debut} au {self.periode_fin}"


class Badges(models.Model):
    CATEGORIE_CHOICES = [
        ('regularite', 'Régularité'),
        ('performance', 'Performance'),
        ('progression', 'Progression'),
        ('special', 'Spécial'),
    ]

    id_badge = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True)
    description = models.TextField()
    icone_url = models.URLField(max_length=500, blank=True, null=True)
    categorie = models.CharField(max_length=20, choices=CATEGORIE_CHOICES)
    valeur_points = models.PositiveSmallIntegerField(default=10)
    critere_json = models.JSONField(default=dict)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = 'badges'
        verbose_name = 'Badge'
        verbose_name_plural = 'Badges'

    def __str__(self):
        return self.nom


class EleveBadges(models.Model):
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='badges_obtenus')
    id_badge = models.ForeignKey(Badges, on_delete=models.CASCADE, related_name='eleves_badge')
    date_obtention = models.DateTimeField(auto_now_add=True)
    contexte = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'eleve_badges'
        verbose_name = 'Badge Élève'
        verbose_name_plural = 'Badges Élèves'
        constraints = [
            models.UniqueConstraint(fields=['id_eleve', 'id_badge'], name='uq_eleve_badges')
        ]

    def __str__(self):
        return f"{self.id_eleve} - {self.id_badge.nom}"


class SessionsFocus(models.Model):
    id_focus = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='sessions_focus')
    duree_pomodoro_min = models.PositiveSmallIntegerField(default=25, validators=[MinValueValidator(10), MaxValueValidator(60)])
    nb_sessions = models.PositiveSmallIntegerField(default=0)
    temps_total_min = models.PositiveIntegerField(default=0)
    id_matiere = models.ForeignKey(Matieres, on_delete=models.SET_NULL, null=True, blank=True, related_name='sessions_focus')
    date_debut = models.DateTimeField(auto_now_add=True)
    date_fin = models.DateTimeField(blank=True, null=True)
    rapport_envoye_parent = models.BooleanField(default=False)

    class Meta:
        db_table = 'sessions_focus'
        verbose_name = 'Session Focus'
        verbose_name_plural = 'Sessions Focus'

    def __str__(self):
        return f"Focus {self.id_eleve} - {self.date_debut.date()}"


class Orientations(models.Model):
    id_orientation = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='orientations')
    date_test = models.DateTimeField(auto_now_add=True)
    aptitudes_detectees = models.JSONField(default=list)
    serie_recommandee = models.CharField(max_length=10, blank=True, null=True)
    metiers_recommandes = models.JSONField(default=list, blank=True)
    filieres_superieures = models.JSONField(default=list, blank=True)
    score_global_test = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, validators=[MinValueValidator(0), MaxValueValidator(100)])
    reponses_test = models.JSONField(default=dict)

    class Meta:
        db_table = 'orientations'
        verbose_name = 'Orientation'
        verbose_name_plural = 'Orientations'

    def __str__(self):
        return f"Orientation {self.id_eleve} - {self.date_test.date()}"


class RemunerationEnseignant(models.Model):
    STATUT_CHOICES = [
        ('en_attente', 'En attente'),
        ('verse', 'Versé'),
        ('annule', 'Annulé'),
    ]

    id_remuneration = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_enseignant = models.ForeignKey(Enseignants, on_delete=models.RESTRICT, related_name='remunerations')
    periode_debut = models.DateField()
    periode_fin = models.DateField()
    nb_vues_cours = models.PositiveIntegerField(default=0)
    nb_abonnes_actifs = models.PositiveSmallIntegerField(default=0)
    montant_calcule = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    montant_verse = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    statut_paiement = models.CharField(max_length=20, choices=STATUT_CHOICES, default='en_attente')
    date_generation = models.DateTimeField(auto_now_add=True)
    date_versement = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'remuneration_enseignant'
        verbose_name = 'Rémunération Enseignant'
        verbose_name_plural = 'Rémunérations Enseignants'
        constraints = [
            models.UniqueConstraint(fields=['id_enseignant', 'periode_debut', 'periode_fin'], name='uq_remun_periode')
        ]

    def __str__(self):
        return f"Rémunération {self.id_enseignant} - {self.periode_debut} au {self.periode_fin}"


class EleveParent(models.Model):
    LIEN_CHOICES = [
        ('parent', 'Parent'),
        ('tuteur', 'Tuteur'),
        ('autre', 'Autre'),
    ]

    id_eleve = models.ForeignKey(Eleves, on_delete=models.CASCADE, related_name='parents_lies')
    id_parent = models.ForeignKey(Parents, on_delete=models.CASCADE, related_name='eleves_lies')
    lien = models.CharField(max_length=10, choices=LIEN_CHOICES, default='parent')
    date_liaison = models.DateTimeField(auto_now_add=True)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = 'eleve_parent'
        verbose_name = 'Lien Élève-Parent'
        verbose_name_plural = 'Liens Élève-Parent'
        constraints = [
            models.UniqueConstraint(fields=['id_eleve', 'id_parent'], name='uq_eleve_parent')
        ]

    def __str__(self):
        return f"{self.id_eleve} - {self.id_parent} ({self.lien})"
