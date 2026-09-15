import uuid as uuid_module

from django.conf import settings
from rest_framework import serializers

from apps.common.serializers import BaseSyncItemSerializer, validate_content

from .models import Task, TaskList

MAX_CONTENT_LENGTH = 1_000_000


class UserTaskListField(serializers.Field):
    default_error_messages = {"invalid": "not a valid uuid", "missing": "task list not found"}

    def to_internal_value(self, data):
        if data in (None, ""):
            return None
        try:
            key = uuid_module.UUID(str(data))
        except (ValueError, AttributeError, TypeError):
            self.fail("invalid")
        request = self.context.get("request")
        task_list = TaskList.objects.filter(user=request.user, pk=key).first()
        if task_list is None:
            self.fail("missing")
        return task_list

    def to_representation(self, value):
        return str(value.id) if value is not None else None


class TaskListSerializer(BaseSyncItemSerializer):
    content = serializers.CharField(max_length=MAX_CONTENT_LENGTH, trim_whitespace=False)

    class Meta:
        model = TaskList
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


class TaskSerializer(BaseSyncItemSerializer):
    content = serializers.CharField(max_length=MAX_CONTENT_LENGTH, trim_whitespace=False)
    task_list = UserTaskListField(required=False, allow_null=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "content",
            "task_list",
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
