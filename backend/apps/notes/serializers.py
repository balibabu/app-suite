import uuid as uuid_module

from django.conf import settings
from rest_framework import serializers

from apps.common.serializers import BaseSyncItemSerializer, validate_content

from .models import Note, NoteFolder

MAX_CONTENT_LENGTH = 1_000_000


class UserFolderField(serializers.Field):
    default_error_messages = {"invalid": "not a valid uuid", "missing": "folder not found"}

    def to_internal_value(self, data):
        if data in (None, ""):
            return None
        try:
            key = uuid_module.UUID(str(data))
        except (ValueError, AttributeError, TypeError):
            self.fail("invalid")
        request = self.context.get("request")
        folder = NoteFolder.objects.filter(user=request.user, pk=key).first()
        if folder is None:
            self.fail("missing")
        return folder

    def to_representation(self, value):
        return str(value.id) if value is not None else None


class NoteFolderSerializer(BaseSyncItemSerializer):
    content = serializers.CharField(max_length=MAX_CONTENT_LENGTH, trim_whitespace=False)
    parent = UserFolderField(required=False, allow_null=True)

    class Meta:
        model = NoteFolder
        fields = [
            "id",
            "content",
            "parent",
            "format_version",
            "base_version",
            "item_version",
            "deleted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["item_version", "deleted_at", "created_at", "updated_at"]

    def validate_content(self, value):
        return validate_content(value, MAX_CONTENT_LENGTH)

    def validate(self, attrs):
        parent = attrs.get("parent")
        if parent is not None and parent.deleted_at is not None:
            raise serializers.ValidationError({"parent": "parent folder is in trash"})
        return attrs


class NoteSerializer(BaseSyncItemSerializer):
    content = serializers.CharField(max_length=MAX_CONTENT_LENGTH, trim_whitespace=False)
    folder = UserFolderField(required=False, allow_null=True)

    class Meta:
        model = Note
        fields = [
            "id",
            "content",
            "folder",
            "format_version",
            "base_version",
            "item_version",
            "deleted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["item_version", "deleted_at", "created_at", "updated_at"]

    def validate_content(self, value):
        return validate_content(value, MAX_CONTENT_LENGTH)

    def validate(self, attrs):
        folder = attrs.get("folder")
        if folder is not None and folder.deleted_at is not None:
            raise serializers.ValidationError({"folder": "folder is in trash"})
        return attrs
