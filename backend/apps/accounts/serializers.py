import re

from django.conf import settings
from rest_framework import serializers

from apps.common import srp as srp_module

from .models import Session, User

USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,31}$")
HEX_PATTERN = re.compile(r"^[0-9a-fA-F]+$")


def validate_username(value):
    value = value.strip().lower()
    if not USERNAME_PATTERN.fullmatch(value):
        raise serializers.ValidationError("must be 3-32 chars of a-z, 0-9, dot, dash, underscore")
    return value


def validate_salt(value):
    if not HEX_PATTERN.fullmatch(value) or not 16 <= len(value) <= 128:
        raise serializers.ValidationError("must be 16-128 hex characters")
    return value.lower()


def validate_verifier(value):
    if not HEX_PATTERN.fullmatch(value) or len(value) > 512:
        raise serializers.ValidationError("must be at most 512 hex characters")
    verifier = srp_module.int_from_hex(value)
    if verifier <= 0 or verifier >= srp_module.N:
        raise serializers.ValidationError("out of group range")
    return srp_module.hex_from_int(verifier)


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=64, validators=[validate_username])
    srp_salt = serializers.CharField(max_length=128, validators=[validate_salt])
    srp_verifier = serializers.CharField(max_length=512, validators=[validate_verifier])
    identity_public_key = serializers.CharField(max_length=4096)
    wrapped_private_key = serializers.CharField(max_length=65536, required=False, allow_blank=True, default="")
    device_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")


class LoginChallengeSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=64, validators=[validate_username])
    purpose = serializers.ChoiceField(choices=["login", "reauth"], default="login")


class ProofFieldsMixin(serializers.Serializer):
    srp_session_id = serializers.UUIDField()
    client_public_ephemeral = serializers.RegexField(HEX_PATTERN, min_length=2, max_length=512)
    client_proof = serializers.RegexField(r"^[0-9a-fA-F]{64}$", max_length=64)


class LoginSerializer(ProofFieldsMixin):
    device_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField(max_length=256)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(max_length=256, required=False, allow_blank=True, default="")


class PasswordChangeSerializer(ProofFieldsMixin):
    new_srp_salt = serializers.CharField(max_length=128, validators=[validate_salt])
    new_srp_verifier = serializers.CharField(max_length=512, validators=[validate_verifier])
    new_wrapped_private_key = serializers.CharField(max_length=65536, required=False, allow_blank=True, default="")


class AccountDeleteSerializer(ProofFieldsMixin):
    pass


class MeSerializer(serializers.ModelSerializer):
    storage_limit = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "identity_public_key",
            "wrapped_private_key",
            "storage_used",
            "storage_limit",
            "date_joined",
            "last_login",
        ]

    def get_storage_limit(self, obj):
        return settings.USER_STORAGE_LIMIT


class SessionSerializer(serializers.ModelSerializer):
    current = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            "id",
            "device_name",
            "ip_address",
            "user_agent",
            "created_at",
            "last_used_at",
            "expires_at",
            "revoked_at",
            "current",
        ]

    def get_current(self, obj):
        request = self.context.get("request")
        session = getattr(request, "auth", None) if request else None
        return session is not None and session.id == obj.id
