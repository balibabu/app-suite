from django.conf import settings
from django.db import models

from apps.common.models import SyncItem


class FileFolder(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="file_folders")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    content = models.TextField()

    class Meta:
        db_table = "files_filefolder"
        indexes = [models.Index(fields=["user", "parent"])]


class StoredFile(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="files")
    folder = models.ForeignKey(FileFolder, null=True, blank=True, on_delete=models.SET_NULL, related_name="files")
    meta_ciphertext = models.TextField(blank=True, default="")
    size = models.BigIntegerField(default=0)
    stored = models.BooleanField(default=False)

    class Meta:
        db_table = "files_storedfile"
        indexes = [models.Index(fields=["user", "folder"])]
