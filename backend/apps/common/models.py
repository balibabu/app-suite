from django.conf import settings
from django.db import models


class SyncItem(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    format_version = models.PositiveIntegerField(default=1)
    item_version = models.PositiveIntegerField(default=1)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            self.item_version += 1
        super().save(*args, **kwargs)

    @property
    def size_bytes(self):
        return 0
