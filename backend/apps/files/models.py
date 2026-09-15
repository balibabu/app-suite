from django.conf import settings
from django.db import models

from apps.common.models import SyncItem


class StoredFile(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="files")
    meta_ciphertext = models.TextField(blank=True, default="")
    size = models.BigIntegerField(default=0)
    stored = models.BooleanField(default=False)

    class Meta:
        db_table = "files_storedfile"
