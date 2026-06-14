from pathlib import Path
import os
import environ
from datetime import timedelta

env = environ.Env(DEBUG=(bool, False))

BASE_DIR = Path(__file__).resolve().parent.parent

environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

SECRET_KEY = env('SECRET_KEY', default='django-insecure-change-this-in-production')

DEBUG = env('DEBUG')

ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['*'])

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'django_filters',
    'corsheaders',
    'drf_spectacular',
    'django_celery_beat',
    'django_celery_results',

    # Local apps
    'school',
]

MIDDLEWARE = [
    'django.middleware.gzip.GZipMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'smartSchool.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': ['Template'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'smartSchool.wsgi.application'

# ─── Database ────────────────────────────────────────────────────────────────
DATABASES = {
    'default': env.db('DATABASE_URL', default='postgres://postgres:beriole@localhost:5432/smartschool')
}

# ─── Cache ────────────────────────────────────────────────────────────────────
# USE_REDIS=False (dev/démo sans Redis) → cache mémoire locale + sessions en base.
# USE_REDIS=True (prod) → Redis partagé.
REDIS_URL = env('REDIS_URL', default='redis://redis:6379/0')
USE_REDIS = env.bool('USE_REDIS', default=True)

if USE_REDIS:
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            },
            'KEY_PREFIX': 'edutrack',
        }
    }
    SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
    SESSION_CACHE_ALIAS = 'default'
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'smartschool-dev',
        }
    }
    SESSION_ENGINE = 'django.contrib.sessions.backends.db'

# ─── Celery ───────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = 'django-db'
CELERY_CACHE_BACKEND = 'default'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Africa/Douala'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ALWAYS_EAGER = env.bool('CELERY_TASK_ALWAYS_EAGER', default=False)

# Tâches périodiques — rappels, alertes et rapports automatiques.
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    'rappels-sessions-quotidiens': {
        'task': 'school.tasks.rappeler_sessions_du_jour',
        'schedule': crontab(hour=7, minute=0),  # chaque jour à 7h
    },
    'alerte-inactivite-quotidienne': {
        'task': 'school.tasks.alerter_inactivite',
        'schedule': crontab(hour=19, minute=0),  # chaque jour à 19h
    },
    'revisions-quotidiennes': {
        'task': 'school.tasks.envoyer_revisions_quotidiennes',
        'schedule': crontab(hour=8, minute=0),  # chaque jour à 8h (nudge matinal)
    },
    'coaching-quotidien': {
        'task': 'school.tasks.coacher_eleves',
        'schedule': crontab(hour=17, minute=0),  # chaque jour à 17h
    },
    'relance-serie-soir': {
        'task': 'school.tasks.relancer_serie_en_peril',
        'schedule': crontab(hour=20, minute=30),  # relance « série en péril » le soir
    },
    'rapport-parental-hebdomadaire': {
        'task': 'school.tasks.generer_rapports_hebdomadaires',
        'schedule': crontab(hour=18, minute=0, day_of_week='sunday'),  # dimanche 18h
    },
}

# ─── Email ────────────────────────────────────────────────────────────────────
# En dev (DEBUG), on n'envoie pas de vrai email : le contenu (dont l'OTP de
# réinitialisation) est écrit dans la console du serveur. Surchargeable via
# EMAIL_BACKEND dans le .env pour tester un vrai envoi SMTP.
EMAIL_BACKEND = env(
    'EMAIL_BACKEND',
    default='django.core.mail.backends.console.EmailBackend' if DEBUG
    else 'django.core.mail.backends.smtp.EmailBackend',
)
EMAIL_HOST = env('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = env.int('EMAIL_PORT', default=587)
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS', default=True)
EMAIL_HOST_USER = env('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER)
ADMIN_EMAIL = env('ADMIN_EMAIL', default=EMAIL_HOST_USER)

# ─── REST Framework ───────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_FILTER_BACKENDS': ['django_filters.rest_framework.DjangoFilterBackend'],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/day',
        'login': '5/min',
    },
}

# ─── JWT ──────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'UPDATE_LAST_LOGIN': True,
    'USER_ID_FIELD': 'id_utilisateur',
    'USER_ID_CLAIM': 'user_id',
}

# ─── CORS ─────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[
    'http://localhost:8081',   # Expo dev server
    'http://localhost:19006',  # Expo web
    'http://127.0.0.1:8081',
])
CORS_ALLOW_CREDENTIALS = True

# ─── Swagger ──────────────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    'TITLE': 'EduTrack API',
    'DESCRIPTION': "API complète pour l'application EduTrack",
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# ─── Auth ─────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'school.Utilisateur'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─── Frontend ─────────────────────────────────────────────────────────────────
FRONTEND_URL = env('FRONTEND_URL', default='http://localhost:8081')

# ─── Fapshi Payment ───────────────────────────────────────────────────────────
FAPSHI_API_USER = env('FAPSHI_API_USER', default='')
FAPSHI_API_KEY = env('FAPSHI_API_KEY', default='')
FAPSHI_BASE_URL = env('FAPSHI_BASE_URL', default='https://live.fapshi.com')

# ─── AWS S3 ───────────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID = env('AWS_ACCESS_KEY_ID', default='')
AWS_SECRET_ACCESS_KEY = env('AWS_SECRET_ACCESS_KEY', default='')
AWS_STORAGE_BUCKET_NAME = env('AWS_STORAGE_BUCKET_NAME', default='')
AWS_S3_REGION_NAME = env('AWS_S3_REGION_NAME', default='eu-west-3')
AWS_S3_FILE_OVERWRITE = False
AWS_DEFAULT_ACL = None

if AWS_STORAGE_BUCKET_NAME:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'

# ─── Firebase Admin SDK ───────────────────────────────────────────────────────
FIREBASE_CREDENTIALS_PATH = env(
    'FIREBASE_CREDENTIALS_PATH',
    # Doit correspondre au MÊME projet Firebase que google-services.json de l'app
    # (sinon les tokens FCM ne sont pas livrables). Projet : pressing-3a96a.
    default=str(BASE_DIR / 'pressing-3a96a-firebase-adminsdk-fbsvc-fff32c379c.json'),
)

try:
    import firebase_admin
    from firebase_admin import credentials as fb_credentials
    if not firebase_admin._apps and os.path.exists(FIREBASE_CREDENTIALS_PATH):
        _fb_cred = fb_credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
        firebase_admin.initialize_app(_fb_cred)
except Exception:
    pass  # Firebase optionnel — l'app fonctionne sans

# ─── AI ───────────────────────────────────────────────────────────────────────
# Groq (API OpenAI-compatible, gratuite et très rapide) — fournisseur par défaut.
GROQ_API_KEY = env('GROQ_API_KEY', default='')
GROQ_MODEL = env('GROQ_MODEL', default='llama-3.3-70b-versatile')
# Autres fournisseurs (optionnels, non utilisés par défaut).
ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY', default='')
OPENAI_API_KEY = env('OPENAI_API_KEY', default='')
GEMINI_API_KEY = env('GEMINI_API_KEY', default='')
GEMINI_MODEL = env('GEMINI_MODEL', default='gemini-2.0-flash')

# ─── Internationalisation ─────────────────────────────────────────────────────
LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Douala'
USE_I18N = True
USE_TZ = True

# ─── Static & Media ───────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Sentry ───────────────────────────────────────────────────────────────────
SENTRY_DSN = env('SENTRY_DSN', default='')
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=0.2,
        send_default_pii=False,
    )
