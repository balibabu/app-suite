from django.conf import settings
from django.db import models

from apps.common.models import SyncItem


class TaskList(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="task_lists")
    content = models.TextField()

    class Meta:
        db_table = "tasks_tasklist"


class Task(SyncItem):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tasks")
    task_list = models.ForeignKey(
        TaskList, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks"
    )
    content = models.TextField()

    class Meta:
        db_table = "tasks_task"
        indexes = [models.Index(fields=["user", "task_list"])]
