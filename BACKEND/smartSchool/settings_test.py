"""Réglages dédiés aux tests automatisés.

Surcharge les services externes (Redis, Celery, email) par des backends
locaux pour que la suite de tests tourne sans dépendance à une
infrastructure (Redis/serveur SMTP). Utilisé via pytest.ini.
"""
from .settings import *  # noqa: F401,F403

# ─── Cache : mémoire locale au lieu de Redis ─────────────────────────────────
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'smartschool-tests',
    }
}

# Les sessions reposent sur le cache : on bascule sur la base en test.
SESSION_ENGINE = 'django.contrib.sessions.backends.db'

# ─── Celery : exécution synchrone en mémoire ─────────────────────────────────
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'

# ─── Email : backend en mémoire ──────────────────────────────────────────────
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# ─── Mots de passe : hash rapide pour accélérer les tests ────────────────────
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
