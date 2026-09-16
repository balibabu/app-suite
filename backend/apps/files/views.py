from django.conf import settings
from django.db.models import F
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.routers import SimpleRouter
from rest_framework.throttling import ScopedRateThrottle

import uuid

from apps.common.views import SyncItemViewSet

from . import storage
from .models import FileFolder, StoredFile
from .serializers import FileFolderSerializer, StoredFileSerializer


class FileFolderViewSet(SyncItemViewSet):
    model = FileFolder
    serializer_class = FileFolderSerializer
    content_fields = ["content", "parent", "format_version"]
    optional_fields = ["parent"]

    def apply_filters(self, queryset):
        parent = self.request.query_params.get("parent")
        if parent is not None:
            value = parent.strip().lower()
            if value in ("none", "null"):
                queryset = queryset.filter(parent__isnull=True)
            else:
                try:
                    queryset = queryset.filter(parent__id=uuid.UUID(value))
                except ValueError:
                    raise ValidationError({"parent": "must be a uuid or 'none'"})
        return queryset

    def subtree_ids(self, root):
        ids = [root.id]
        frontier = [root.id]
        while frontier:
            children = list(self.items().filter(parent_id__in=frontier).values_list("id", flat=True))
            frontier = children
            ids.extend(children)
        return ids

    def destroy(self, request, pk=None):
        item = self.get_item(pk)
        ids = self.subtree_ids(item)
        if self.is_truthy("purge"):
            freed = 0
            for record in StoredFile.objects.filter(user=request.user, folder_id__in=ids):
                if record.stored:
                    storage.delete_stored(record.user_id, record.id)
                    freed += record.size
                record.delete()
            if freed:
                user = request.user
                user.storage_used = max(0, user.storage_used - freed)
                user.save(update_fields=["storage_used"])
            self.items().filter(id__in=ids).delete()
        elif item.deleted_at is None:
            now = timezone.now()
            self.items().filter(id__in=ids, deleted_at__isnull=True).update(
                deleted_at=now, updated_at=now, item_version=F("item_version") + 1
            )
            StoredFile.objects.filter(user=request.user, folder_id__in=ids, deleted_at__isnull=True).update(
                deleted_at=now, updated_at=now, item_version=F("item_version") + 1
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        item = self.get_item(pk)
        if item.deleted_at is not None:
            item.deleted_at = None
            item.save()
            ids = self.subtree_ids(item)
            now = timezone.now()
            self.items().filter(id__in=ids[1:], deleted_at__isnull=False).update(
                deleted_at=None, updated_at=now, item_version=F("item_version") + 1
            )
            StoredFile.objects.filter(user=request.user, folder_id__in=ids, deleted_at__isnull=False).update(
                deleted_at=None, updated_at=now, item_version=F("item_version") + 1
            )
        return Response(self.get_serializer(item).data)

    def perform_purge(self, item):
        item.delete()


class StoredFileViewSet(SyncItemViewSet):
    model = StoredFile
    serializer_class = StoredFileSerializer
    content_fields = ["meta_ciphertext", "folder", "format_version"]
    optional_fields = ["folder"]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "uploads"

    def apply_filters(self, queryset):
        folder = self.request.query_params.get("folder")
        if folder is not None:
            value = folder.strip().lower()
            if value in ("none", "null"):
                queryset = queryset.filter(folder__isnull=True)
            else:
                try:
                    queryset = queryset.filter(folder__id=uuid.UUID(value))
                except ValueError:
                    raise ValidationError({"folder": "must be a uuid or 'none'"})
        return queryset

    @action(detail=True, methods=["put", "get"], url_path="content")
    def content(self, request, pk=None):
        if request.method == "PUT":
            return self.upload_content(request, pk)
        return self.download_content(request, pk)

    def upload_content(self, request, pk):
        record = self.get_item(pk)
        if record.deleted_at is not None:
            return Response(
                {"detail": "item is in trash", "code": "item_deleted"},
                status=status.HTTP_409_CONFLICT,
            )
        if record.stored:
            return Response(
                {"detail": "content already uploaded", "code": "content_exists"},
                status=status.HTTP_409_CONFLICT,
            )
        content_length = request.META.get("CONTENT_LENGTH") or request.META.get("HTTP_X_CONTENT_LENGTH")
        if content_length and content_length.isdigit() and int(content_length) > settings.MAX_FILE_SIZE:
            return Response(
                {"detail": "file exceeds maximum size of {} bytes".format(settings.MAX_FILE_SIZE)},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        remaining = settings.USER_STORAGE_LIMIT - request.user.storage_used
        allowed = min(settings.MAX_FILE_SIZE, max(remaining, 0))
        path = storage.file_path(request.user.id, record.id)
        try:
            size = storage.write_request_stream(request, path, allowed)
        except ValueError as exc:
            return Response(
                {"detail": str(exc), "code": "storage_limit_exceeded"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        record.stored = True
        record.size = size
        record.save()
        request.user.storage_used += size
        request.user.save(update_fields=["storage_used"])
        return Response(self.get_serializer(record).data)

    def download_content(self, request, pk):
        record = self.get_item(pk)
        if not record.stored:
            return Response(status=status.HTTP_404_NOT_FOUND)
        handle = storage.read_stored(request.user.id, record.id)
        if handle is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return FileResponse(
            handle,
            as_attachment=True,
            filename="{}.bin".format(record.id),
            content_type="application/octet-stream",
        )

    def perform_purge(self, item):
        if item.stored:
            storage.delete_stored(item.user_id, item.id)
            user = item.user
            user.storage_used = max(0, user.storage_used - item.size)
            user.save(update_fields=["storage_used"])
        item.delete()


router = SimpleRouter()
router.register("folders", FileFolderViewSet, basename="file-folders")
router.register("", StoredFileViewSet, basename="files")

urlpatterns = router.urls
