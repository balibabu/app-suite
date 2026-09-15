from django.urls import include, path

from .views import health

urlpatterns = [
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/notes/", include("apps.notes.urls")),
    path("api/v1/tasks/", include("apps.tasks.urls")),
    path("api/v1/files/", include("apps.files.urls")),
    path("api/v1/health/", health, name="health"),
]

handler404 = "config.views.handler404"
handler500 = "config.views.handler500"
