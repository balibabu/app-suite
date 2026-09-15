from django.conf import settings
from django.http import FileResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.routers import SimpleRouter
from rest_framework.throttling import ScopedRateThrottle

from apps.common.views import SyncItemViewSet

from . import storage
from .models import StoredFile
from .serializers import StoredFileSerializer


class StoredFileViewSet(SyncItemViewSet):
    model = StoredFile
    serializer_class = StoredFileSerializer
    content_fields = ["meta_ciphertext", "format_version"]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "uploads"

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
router.register("", StoredFileViewSet, basename="files")

urlpatterns = router.urls
