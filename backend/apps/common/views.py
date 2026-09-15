import uuid as uuid_module

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

TRUTHY = {"1", "true", "yes"}


class SyncItemViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "put", "delete", "head", "options"]
    model = None
    serializer_class = None
    content_fields = ["content", "format_version"]
    optional_fields = []

    def items(self):
        return self.model.objects.filter(user=self.request.user)

    def is_truthy(self, name):
        return self.request.query_params.get(name, "").strip().lower() in TRUTHY

    def apply_filters(self, queryset):
        return queryset

    def get_queryset(self):
        queryset = self.items()
        updated_since = self.request.query_params.get("updated_since")
        if updated_since:
            moment = parse_datetime(updated_since)
            if moment is None or timezone.is_naive(moment):
                raise ValidationError({"updated_since": "must be an ISO 8601 datetime with timezone"})
            queryset = queryset.filter(updated_at__gt=moment)
        elif self.is_truthy("trash"):
            queryset = queryset.filter(deleted_at__isnull=False)
        else:
            queryset = queryset.filter(deleted_at__isnull=True)
        queryset = self.apply_filters(queryset)
        return queryset.order_by("updated_at")

    def parse_pk(self, pk):
        try:
            return uuid_module.UUID(str(pk))
        except (ValueError, AttributeError, TypeError):
            raise NotFound("item not found")

    def get_item(self, pk):
        key = self.parse_pk(pk)
        item = self.items().filter(pk=key).first()
        if item is None:
            raise NotFound("item not found")
        return item

    def list(self, request):
        queryset = self.get_queryset()
        return Response(self.get_serializer(queryset, many=True).data)

    def retrieve(self, request, pk=None):
        item = self.get_item(pk)
        return Response(self.get_serializer(item).data)

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "id" not in data or data["id"] is None:
            raise ValidationError({"id": "client generated id is required"})
        if self.items().filter(pk=data["id"]).exists():
            return Response(
                {"detail": "item already exists", "code": "exists"},
                status=status.HTTP_409_CONFLICT,
            )
        item = serializer.save(user=request.user)
        return Response(self.get_serializer(item).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        key = self.parse_pk(pk)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        incoming_id = data.get("id")
        if incoming_id is not None and incoming_id != key:
            raise ValidationError({"id": "does not match url"})
        item = self.items().filter(pk=key).first()
        if item is None:
            item = serializer.save(user=request.user, id=key)
            return Response(self.get_serializer(item).data, status=status.HTTP_201_CREATED)
        base_version = data.get("base_version")
        if base_version is not None and base_version != item.item_version:
            return Response(
                {
                    "detail": "item changed since base_version",
                    "code": "version_conflict",
                    "current": self.get_serializer(item).data,
                },
                status=status.HTTP_409_CONFLICT,
            )
        for field in self.content_fields:
            if field in data:
                setattr(item, field, data[field])
            elif field in self.optional_fields:
                setattr(item, field, None)
        item.deleted_at = None
        item.save()
        return Response(self.get_serializer(item).data)

    def destroy(self, request, pk=None):
        item = self.get_item(pk)
        if self.is_truthy("purge"):
            self.perform_purge(item)
        elif item.deleted_at is None:
            item.deleted_at = timezone.now()
            item.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_purge(self, item):
        item.delete()

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        item = self.get_item(pk)
        if item.deleted_at is not None:
            item.deleted_at = None
            item.save()
        return Response(self.get_serializer(item).data)

    def get_serializer(self, *args, **kwargs):
        return self.serializer_class(*args, context={"request": self.request, "view": self}, **kwargs)
