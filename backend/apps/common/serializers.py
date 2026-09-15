from rest_framework import serializers


class BaseSyncItemSerializer(serializers.ModelSerializer):
    base_version = serializers.IntegerField(required=False, min_value=1, write_only=True)
    id = serializers.UUIDField(required=False)

    class Meta:
        model = None
        fields = []
        read_only_fields = ["item_version", "deleted_at", "created_at", "updated_at"]


def validate_content(value, max_length):
    if len(value) > max_length:
        raise serializers.ValidationError("content exceeds maximum length of {} characters".format(max_length))
    return value
