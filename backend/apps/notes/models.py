from django.conf import settings
from django.db import models

from apps.common.models import SyncItem


class NoteFolder(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="note_folders")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    content = models.TextField()

    class Meta:
        db_table = "notes_notefolder"
        indexes = [models.Index(fields=["user", "parent"])]


class Note(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes")
    folder = models.ForeignKey(NoteFolder, null=True, blank=True, on_delete=models.SET_NULL, related_name="notes")
    content = models.TextField()

    class Meta:
        db_table = "notes_note"
        indexes = [models.Index(fields=["user", "folder"])]
