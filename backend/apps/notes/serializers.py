from rest_framework import serializers

from apps.common.serializers import BaseSyncItemSerializer, validate_content

from .models import Note

MAX_CONTENT_LENGTH = 1_000_000


class NoteSerializer(BaseSyncItemSerializer):
    content = serializers.CharField(max_length=MAX_CONTENT_LENGTH, trim_whitespace=False)

    class Meta:
        model = Note
        fields = [
            "id",
            "content",
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
