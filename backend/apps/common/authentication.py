import jwt
from django.conf import settings
from django.utils import timezone
from rest_framework import authentication, exceptions

LAST_USED_TOUCH_INTERVAL = 60


class JWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8", errors="ignore")
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != self.keyword.lower():
            return None
        return self.authenticate_credentials(parts[1], request)

    def authenticate_credentials(self, token, request):
        from apps.accounts.models import Session

        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed("access token expired")
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed("invalid access token")
        if payload.get("type") != "access":
            raise exceptions.AuthenticationFailed("invalid token type")
        session = (
            Session.objects.select_related("user")
            .filter(id=payload.get("sid"), revoked_at__isnull=True, expires_at__gt=timezone.now())
            .first()
        )
        if session is None:
            raise exceptions.AuthenticationFailed("session revoked or expired")
        if not session.user.is_active:
            raise exceptions.AuthenticationFailed("user is inactive")
        self._touch(session)
        return (session.user, session)

    def _touch(self, session):
        now = timezone.now()
        elapsed = (now - (session.last_used_at or session.created_at)).total_seconds()
        if elapsed >= LAST_USED_TOUCH_INTERVAL:
            session.last_used_at = now
            session.save(update_fields=["last_used_at"])

    def authenticate_header(self, request):
        return self.keyword
