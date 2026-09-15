import uuid

from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.routers import SimpleRouter

from apps.common.views import SyncItemViewSet

from .models import Note, NoteFolder
from .serializers import NoteFolderSerializer, NoteSerializer


class NoteFolderViewSet(SyncItemViewSet):
    model = NoteFolder
    serializer_class = NoteFolderSerializer
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
            Note.objects.filter(user=request.user, folder_id__in=ids).delete()
            self.items().filter(id__in=ids).delete()
        elif item.deleted_at is None:
            now = timezone.now()
            self.items().filter(id__in=ids, deleted_at__isnull=True).update(
                deleted_at=now, updated_at=now, item_version=F("item_version") + 1
            )
            Note.objects.filter(user=request.user, folder_id__in=ids, deleted_at__isnull=True).update(
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
            Note.objects.filter(user=request.user, folder_id__in=ids, deleted_at__isnull=False).update(
                deleted_at=None, updated_at=now, item_version=F("item_version") + 1
            )
        return Response(self.get_serializer(item).data)


class NoteViewSet(SyncItemViewSet):
    model = Note
    serializer_class = NoteSerializer
    content_fields = ["content", "folder", "format_version"]
    optional_fields = ["folder"]

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


router = SimpleRouter()
router.register("folders", NoteFolderViewSet, basename="note-folders")
router.register("", NoteViewSet, basename="notes")

urlpatterns = router.urls
