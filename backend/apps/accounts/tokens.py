import hashlib
import secrets

import jwt
from django.conf import settings
from django.utils import timezone


class TokenError(Exception):
    pass


class InvalidToken(TokenError):
    pass


class ReusedToken(TokenError):
    pass


def _hash_refresh(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def build_refresh_token(session, raw):
    return "{}.{}".format(session.id, raw)


def parse_refresh_token(token):
    try:
        session_id, raw = token.split(".", 1)
    except (AttributeError, ValueError):
        raise InvalidToken("malformed refresh token")
    return session_id, raw


def create_access_token(user, session):
    now = timezone.now()
    payload = {
        "sub": str(user.id),
        "sid": str(session.id),
        "type": "access",
        "jti": secrets.token_hex(8),
        "iat": int(now.timestamp()),
        "exp": int((now + settings.ACCESS_TOKEN_LIFETIME).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def issue_session(user, device_name="", request=None):
    raw = secrets.token_urlsafe(48)
    now = timezone.now()
    ip = None
    user_agent = ""
    if request is not None:
        ip = _client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:256]
    session = user.sessions.create(
        refresh_hash=_hash_refresh(raw),
        device_name=(device_name or "")[:128],
        ip_address=ip,
        user_agent=user_agent,
        expires_at=now + settings.REFRESH_TOKEN_LIFETIME,
    )
    return {
        "session_id": str(session.id),
        "access": create_access_token(user, session),
        "access_expires_in": int(settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
        "refresh": build_refresh_token(session, raw),
        "refresh_expires_in": int(settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
    }


def rotate_refresh_token(token):
    session_id, raw = parse_refresh_token(token)
    from .models import Session

    session = Session.objects.select_related("user").filter(id=session_id).first()
    if session is None:
        raise InvalidToken("session not found")
    now = timezone.now()
    if session.revoked_at is not None or session.expires_at <= now:
        raise InvalidToken("session revoked or expired")
    if session.refresh_hash != _hash_refresh(raw):
        session.revoked_at = now
        session.save(update_fields=["revoked_at"])
        raise ReusedToken("refresh token reuse detected")
    new_raw = secrets.token_urlsafe(48)
    session.refresh_hash = _hash_refresh(new_raw)
    session.expires_at = now + settings.REFRESH_TOKEN_LIFETIME
    session.save(update_fields=["refresh_hash", "expires_at"])
    return {
        "session_id": str(session.id),
        "access": create_access_token(session.user, session),
        "access_expires_in": int(settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
        "refresh": build_refresh_token(session, new_raw),
        "refresh_expires_in": int(settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
    }


def revoke_session(session):
    if session.revoked_at is None:
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])


def _client_ip(request):
    if settings.TRUST_X_FORWARDED_FOR:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
