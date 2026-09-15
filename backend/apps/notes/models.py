from django.conf import settings
from django.db import models

from apps.common.models import SyncItem


class Note(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes")
    content = models.TextField()

    class Meta:
        db_table = "notes_note"
