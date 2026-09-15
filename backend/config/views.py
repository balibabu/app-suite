from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone


def health(request):
    return JsonResponse({"status": "ok", "time": timezone.now().isoformat()})


def handler404(request, exception=None):
    return JsonResponse({"detail": "not found"}, status=404)


def handler500(request):
    return JsonResponse({"detail": "internal server error"}, status=500)


def spa(request):
    if request.path.startswith("/api/"):
        return JsonResponse({"detail": "not found"}, status=404)
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return JsonResponse({"detail": "frontend build not found"}, status=503)
    return HttpResponse(index.read_bytes(), content_type="text/html")
