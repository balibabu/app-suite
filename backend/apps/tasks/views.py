import uuid

from rest_framework.exceptions import ValidationError
from rest_framework.routers import SimpleRouter

from apps.common.views import SyncItemViewSet

from .models import Task, TaskList
from .serializers import TaskListSerializer, TaskSerializer


class TaskListViewSet(SyncItemViewSet):
    model = TaskList
    serializer_class = TaskListSerializer
    content_fields = ["content", "format_version"]


class TaskViewSet(SyncItemViewSet):
    model = Task
    serializer_class = TaskSerializer
    content_fields = ["content", "task_list", "format_version"]
    optional_fields = ["task_list"]

    def apply_filters(self, queryset):
        task_list = self.request.query_params.get("task_list")
        if task_list is not None:
            value = task_list.strip().lower()
            if value in ("none", "null"):
                queryset = queryset.filter(task_list__isnull=True)
            else:
                try:
                    queryset = queryset.filter(task_list__id=uuid.UUID(value))
                except ValueError:
                    raise ValidationError({"task_list": "must be a uuid or 'none'"})
        return queryset


router = SimpleRouter()
router.register("lists", TaskListViewSet, basename="task-lists")
router.register("tasks", TaskViewSet, basename="tasks")

urlpatterns = router.urls
