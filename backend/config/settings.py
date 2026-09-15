import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

FRONTEND_DIST = Path(os.environ.get("APPSUITE_FRONTEND_DIST", BASE_DIR.parent / "frontend" / "dist"))


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


SECRET_KEY = os.environ.get("APPSUITE_SECRET_KEY") or "django-insecure-dev-only-change-me"
DEBUG = env_bool("APPSUITE_DEBUG", True)
ALLOWED_HOSTS = [host.strip() for host in os.environ.get("APPSUITE_ALLOWED_HOSTS", "*").split(",") if host.strip()]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.accounts",
    "apps.common",
    "apps.notes",
    "apps.tasks",
    "apps.files",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = []

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("APPSUITE_DB_PATH") or BASE_DIR / "db.sqlite3",
    }
}

AUTH_USER_MODEL = "accounts.User"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.common.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": "15/min",
        "auth": "60/min",
        "uploads": "120/min",
    },
}

JWT_SECRET = os.environ.get("APPSUITE_JWT_SECRET") or SECRET_KEY
ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
REFRESH_TOKEN_LIFETIME = timedelta(days=30)
SRP_SESSION_LIFETIME = timedelta(minutes=2)
TRUST_X_FORWARDED_FOR = env_bool("APPSUITE_TRUST_X_FORWARDED_FOR", False)

MEDIA_ROOT = Path(os.environ.get("APPSUITE_MEDIA_ROOT") or BASE_DIR / "media")
MAX_FILE_SIZE = int(os.environ.get("APPSUITE_MAX_FILE_SIZE") or 100 * 1024 * 1024)
USER_STORAGE_LIMIT = int(os.environ.get("APPSUITE_USER_STORAGE_LIMIT") or 1024**3)

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "APPSUITE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_ALL_ORIGINS = env_bool("APPSUITE_CORS_ALLOW_ALL", DEBUG)

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.is_dir() else []
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
