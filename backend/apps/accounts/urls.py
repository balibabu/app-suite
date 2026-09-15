from django.urls import path

from .views import (
    AccountDeleteView,
    LoginChallengeView,
    LoginVerifyView,
    LogoutAllView,
    LogoutView,
    MeView,
    PasswordChangeView,
    RefreshView,
    RegisterView,
    SessionDetailView,
    SessionListView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/challenge/", LoginChallengeView.as_view(), name="auth-login-challenge"),
    path("login/", LoginVerifyView.as_view(), name="auth-login"),
    path("token/refresh/", RefreshView.as_view(), name="auth-token-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("logout-all/", LogoutAllView.as_view(), name="auth-logout-all"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("sessions/", SessionListView.as_view(), name="auth-sessions"),
    path("sessions/<uuid:session_id>/", SessionDetailView.as_view(), name="auth-session-detail"),
    path("password/change/", PasswordChangeView.as_view(), name="auth-password-change"),
    path("account/", AccountDeleteView.as_view(), name="auth-account-delete"),
]
