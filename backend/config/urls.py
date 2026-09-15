from django.urls import include, path, re_path

from .views import health, spa

urlpatterns = [
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/notes/", include("apps.notes.urls")),
    path("api/v1/tasks/", include("apps.tasks.urls")),
    path("api/v1/files/", include("apps.files.urls")),
    path("api/v1/health/", health, name="health"),
    re_path(r"^", spa),
]

handler404 = "config.views.handler404"
handler500 = "config.views.handler500"
