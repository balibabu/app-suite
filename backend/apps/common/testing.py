import secrets

from django.test import override_settings
from rest_framework.test import APIClient, APITestCase
from rest_framework.throttling import SimpleRateThrottle

from apps.common import srp

NO_THROTTLE_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.common.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_THROTTLE_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": "1000/min",
        "auth": "1000/min",
        "uploads": "1000/min",
    },
}


@override_settings(REST_FRAMEWORK=NO_THROTTLE_FRAMEWORK)
class BaseAPITestCase(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._original_rates = SimpleRateThrottle.THROTTLE_RATES
        SimpleRateThrottle.THROTTLE_RATES = NO_THROTTLE_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        cls.addClassCleanup(setattr, SimpleRateThrottle, "THROTTLE_RATES", cls._original_rates)


def build_registration(username, password):
    salt = secrets.token_hex(16)
    private_key = srp.derive_private_key(salt, username, password)
    return {
        "username": username,
        "srp_salt": salt,
        "srp_verifier": srp.hex_from_int(srp.derive_verifier(private_key)),
        "identity_public_key": "b64identitykey",
        "wrapped_private_key": "b64wrappedkey",
    }


def register_user(username="alice", password="correct horse battery"):
    client = APIClient()
    payload = build_registration(username, password)
    response = client.post("/api/v1/auth/register/", payload, format="json")
    assert response.status_code == 201, response.data
    return response.data


def try_srp_login(client, username, password):
    challenge = client.post(
        "/api/v1/auth/login/challenge/", {"username": username, "purpose": "login"}, format="json"
    )
    if challenge.status_code != 200:
        return challenge
    server_public = srp.int_from_hex(challenge.data["server_public_ephemeral"])
    a = srp.generate_private_ephemeral()
    session = srp.client_session(a, server_public, challenge.data["srp_salt"], username, password)
    return client.post(
        "/api/v1/auth/login/",
        {
            "srp_session_id": challenge.data["srp_session_id"],
            "client_public_ephemeral": srp.hex_from_int(pow(srp.G, a, srp.N)),
            "client_proof": session["client_proof"],
        },
        format="json",
    )


def srp_login(client, username, password, purpose="login", device_name="test device"):
    challenge = client.post(
        "/api/v1/auth/login/challenge/", {"username": username, "purpose": purpose}, format="json"
    )
    assert challenge.status_code == 200, challenge.data
    server_public = srp.int_from_hex(challenge.data["server_public_ephemeral"])
    a = srp.generate_private_ephemeral()
    session = srp.client_session(a, server_public, challenge.data["srp_salt"], username, password)
    response = client.post(
        "/api/v1/auth/login/",
        {
            "srp_session_id": challenge.data["srp_session_id"],
            "client_public_ephemeral": srp.hex_from_int(pow(srp.G, a, srp.N)),
            "client_proof": session["client_proof"],
            "device_name": device_name,
        },
        format="json",
    )
    assert response.status_code == 200, response.data
    return response.data


def authorized_client(tokens):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer {}".format(tokens["access"]))
    return client


def login_and_get_client(username="alice", password="correct horse battery"):
    register_user(username, password)
    tokens = srp_login(APIClient(), username, password)
    return authorized_client(tokens), tokens
