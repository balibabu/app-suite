import uuid

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import models

from .managers import UserManager


class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=32, unique=True, validators=[UnicodeUsernameValidator()])
    srp_salt = models.CharField(max_length=128)
    srp_verifier = models.CharField(max_length=512)
    identity_public_key = models.TextField()
    wrapped_private_key = models.TextField(blank=True, default="")
    storage_used = models.BigIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "accounts_user"


class SRPSession(models.Model):
    PURPOSES = [("login", "login"), ("reauth", "reauth")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="srp_sessions")
    server_private = models.CharField(max_length=512)
    server_public = models.CharField(max_length=512)
    client_public = models.CharField(max_length=512, blank=True, default="")
    purpose = models.CharField(max_length=16, choices=PURPOSES, default="login")
    consumed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "accounts_srp_session"
        indexes = [models.Index(fields=["user", "purpose", "consumed"])]


class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    refresh_hash = models.CharField(max_length=64, unique=True)
    device_name = models.CharField(max_length=128, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=256, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "accounts_session"
        ordering = ["-last_used_at"]
