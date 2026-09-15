import hashlib
import hmac
import uuid as uuid_module

from django.conf import settings
from django.db import IntegrityError
from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common import srp as srp_module

from .models import SRPSession, Session, User
from .serializers import (
    AccountDeleteSerializer,
    LoginChallengeSerializer,
    LoginSerializer,
    LogoutSerializer,
    MeSerializer,
    PasswordChangeSerializer,
    RefreshSerializer,
    RegisterSerializer,
    SessionSerializer,
)
from .tokens import InvalidToken, TokenError, issue_session, revoke_session, rotate_refresh_token


def verify_srp_proof(user, payload, purpose):
    srp_session = (
        SRPSession.objects.filter(
            id=payload["srp_session_id"],
            user=user,
            purpose=purpose,
            consumed=False,
            expires_at__gt=timezone.now(),
        ).first()
    )
    if srp_session is None:
        raise AuthenticationFailed("invalid credentials")
    try:
        client_public = srp_module.int_from_hex(payload["client_public_ephemeral"])
        session = srp_module.server_session(
            srp_module.int_from_hex(srp_session.server_private),
            client_public,
            srp_module.int_from_hex(user.srp_verifier),
        )
    except ValueError:
        srp_session.consumed = True
        srp_session.save(update_fields=["consumed"])
        raise AuthenticationFailed("invalid credentials")
    if not srp_module.proofs_match(session["client_proof"], payload["client_proof"]):
        srp_session.consumed = True
        srp_session.save(update_fields=["consumed"])
        raise AuthenticationFailed("invalid credentials")
    srp_session.consumed = True
    srp_session.client_public = srp_module.hex_from_int(client_public)
    srp_session.save(update_fields=["consumed", "client_public"])
    return session


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        if not settings.ALLOW_SIGNUP:
            return Response(
                {"detail": "signups are disabled on this server", "code": "signup_disabled"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user = User.objects.create_user(
                username=data["username"],
                srp_salt=data["srp_salt"],
                srp_verifier=data["srp_verifier"],
                identity_public_key=data["identity_public_key"],
                wrapped_private_key=data["wrapped_private_key"],
            )
        except IntegrityError:
            return Response(
                {"detail": "username already taken", "code": "username_taken"},
                status=status.HTTP_409_CONFLICT,
            )
        tokens = issue_session(user, data["device_name"], request)
        return Response({"user": MeSerializer(user).data, **tokens}, status=status.HTTP_201_CREATED)


class LoginChallengeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginChallengeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.filter(username=data["username"], is_active=True).first()
        if user is None:
            return Response(self._decoy_challenge(data["username"]))
        SRPSession.objects.filter(expires_at__lt=timezone.now()).delete()
        server_private, server_public = srp_module.generate_server_ephemeral(
            srp_module.int_from_hex(user.srp_verifier)
        )
        srp_session = SRPSession.objects.create(
            user=user,
            server_private=srp_module.hex_from_int(server_private),
            server_public=srp_module.hex_from_int(server_public),
            purpose=data["purpose"],
            expires_at=timezone.now() + settings.SRP_SESSION_LIFETIME,
        )
        return Response(
            {
                "srp_session_id": str(srp_session.id),
                "srp_salt": user.srp_salt,
                "server_public_ephemeral": srp_session.server_public,
            }
        )

    def _decoy_challenge(self, username):
        key = settings.SECRET_KEY.encode()

        def digest(label):
            return hmac.new(key, "{}:{}".format(label, username).encode(), hashlib.sha256).digest()

        salt = digest("salt").hex()[:32]
        verifier = int.from_bytes(digest("verifier"), "big") % srp_module.N
        private = int.from_bytes(digest("private"), "big") % (srp_module.N - 1) + 1
        public = (srp_module.multiplier_k() * verifier + pow(srp_module.G, private, srp_module.N)) % srp_module.N
        return {
            "srp_session_id": str(uuid_module.uuid5(uuid_module.NAMESPACE_URL, digest("session").hex())),
            "srp_salt": salt,
            "server_public_ephemeral": srp_module.hex_from_int(public),
        }


class LoginVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        srp_session = (
            SRPSession.objects.select_related("user")
            .filter(id=data["srp_session_id"], purpose="login", consumed=False, expires_at__gt=timezone.now())
            .first()
        )
        if srp_session is None or not srp_session.user.is_active:
            raise AuthenticationFailed("invalid credentials")
        try:
            client_public = srp_module.int_from_hex(data["client_public_ephemeral"])
            session = srp_module.server_session(
                srp_module.int_from_hex(srp_session.server_private),
                client_public,
                srp_module.int_from_hex(srp_session.user.srp_verifier),
            )
        except ValueError:
            srp_session.consumed = True
            srp_session.save(update_fields=["consumed"])
            raise AuthenticationFailed("invalid credentials")
        if not srp_module.proofs_match(session["client_proof"], data["client_proof"]):
            srp_session.consumed = True
            srp_session.save(update_fields=["consumed"])
            raise AuthenticationFailed("invalid credentials")
        srp_session.consumed = True
        srp_session.client_public = srp_module.hex_from_int(client_public)
        srp_session.save(update_fields=["consumed", "client_public"])
        user = srp_session.user
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        tokens = issue_session(user, data["device_name"], request)
        return Response({"server_proof": session["server_proof"], "user": MeSerializer(user).data, **tokens})


class RefreshView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tokens = rotate_refresh_token(serializer.validated_data["refresh"])
        except TokenError as exc:
            raise AuthenticationFailed(str(exc))
        return Response(tokens)


class LogoutView(APIView):
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data["refresh"]
        target = None
        if refresh:
            from .tokens import parse_refresh_token

            try:
                session_id, _ = parse_refresh_token(refresh)
            except InvalidToken:
                session_id = None
            if session_id:
                target = Session.objects.filter(user=request.user, id=session_id).first()
        if target is None:
            target = request.auth
        revoke_session(target)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LogoutAllView(APIView):
    def post(self, request):
        now = timezone.now()
        request.user.sessions.filter(revoked_at__isnull=True).update(revoked_at=now)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(MeSerializer(request.user).data)


class SessionListView(APIView):
    def get(self, request):
        sessions = request.user.sessions.filter(revoked_at__isnull=True)
        return Response(SessionSerializer(sessions, many=True, context={"request": request}).data)


class SessionDetailView(APIView):
    def delete(self, request, session_id):
        session = request.user.sessions.filter(id=session_id).first()
        if session is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        revoke_session(session)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordChangeView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        verify_srp_proof(request.user, data, "reauth")
        request.user.srp_salt = data["new_srp_salt"]
        request.user.srp_verifier = data["new_srp_verifier"]
        request.user.wrapped_private_key = data["new_wrapped_private_key"]
        request.user.save(update_fields=["srp_salt", "srp_verifier", "wrapped_private_key"])
        now = timezone.now()
        request.user.sessions.filter(revoked_at__isnull=True).exclude(id=request.auth.id).update(revoked_at=now)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountDeleteView(APIView):
    def post(self, request):
        serializer = AccountDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verify_srp_proof(request.user, serializer.validated_data, "reauth")
        user_id = request.user.id
        request.user.delete()
        self._remove_files(user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request):
        return self.post(request)

    def _remove_files(self, user_id):
        import shutil

        user_dir = settings.MEDIA_ROOT / "files" / str(user_id)
        shutil.rmtree(user_dir, ignore_errors=True)
