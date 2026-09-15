from rest_framework.routers import SimpleRouter

from apps.common.views import SyncItemViewSet

from .models import Note
from .serializers import NoteSerializer


class NoteViewSet(SyncItemViewSet):
    model = Note
    serializer_class = NoteSerializer
    content_fields = ["content", "format_version"]


router = SimpleRouter()
router.register("", NoteViewSet, basename="notes")

urlpatterns = router.urls
