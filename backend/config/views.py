from django.http import JsonResponse
from django.utils import timezone


def health(request):
    return JsonResponse({"status": "ok", "time": timezone.now().isoformat()})


def handler404(request, exception=None):
    return JsonResponse({"detail": "not found"}, status=404)


def handler500(request):
    return JsonResponse({"detail": "internal server error"}, status=500)
