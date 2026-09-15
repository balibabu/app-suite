from rest_framework import serializers

from apps.common.serializers import BaseSyncItemSerializer, validate_content

from .models import StoredFile

MAX_META_LENGTH = 20_000


class StoredFileSerializer(BaseSyncItemSerializer):
    meta_ciphertext = serializers.CharField(max_length=MAX_META_LENGTH, trim_whitespace=False)

    class Meta:
        model = StoredFile
        fields = [
            "id",
            "meta_ciphertext",
            "format_version",
            "base_version",
            "size",
            "stored",
            "item_version",
            "deleted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["item_version", "size", "stored", "deleted_at", "created_at", "updated_at"]

    def validate_meta_ciphertext(self, value):
        return validate_content(value, MAX_META_LENGTH)
