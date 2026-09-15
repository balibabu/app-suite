from django.urls import reverse

from apps.common import srp
from apps.common.testing import (
    BaseAPITestCase,
    build_registration,
    login_and_get_client,
    register_user,
    srp_login,
    try_srp_login,
)

from .models import Session, User


class RegistrationTests(BaseAPITestCase):
    def test_register_returns_user_and_tokens(self):
        data = register_user("alice", "correct horse battery")
        self.assertIn("access", data)
        self.assertIn("refresh", data)
        self.assertEqual(data["user"]["username"], "alice")
        self.assertTrue(User.objects.filter(username="alice").exists())

    def test_register_duplicate_username(self):
        register_user("alice", "pw1")
        client = self.client
        payload = build_registration("alice", "pw2")
        response = client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, 409)

    def test_register_invalid_username(self):
        payload = build_registration("Bad Name!", "pw")
        response = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_register_rejected_when_signup_disabled(self):
        with self.settings(ALLOW_SIGNUP=False):
            response = self.client.post("/api/v1/auth/register/", build_registration("bob", "pw12345678"), format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "signup_disabled")
        self.assertFalse(User.objects.filter(username="bob").exists())


class LoginTests(BaseAPITestCase):
    def setUp(self):
        self.username = "alice"
        self.password = "correct horse battery"
        register_user(self.username, self.password)

    def test_login_success(self):
        data = srp_login(self.client, self.username, self.password)
        self.assertIn("server_proof", data)
        self.assertIn("access", data)
        self.assertTrue(User.objects.get(username=self.username).last_login)

    def test_login_wrong_password(self):
        challenge = self.client.post(
            "/api/v1/auth/login/challenge/", {"username": self.username}, format="json"
        )
        self.assertEqual(challenge.status_code, 200)
        a = srp.generate_private_ephemeral()
        session = srp.client_session(
            a,
            srp.int_from_hex(challenge.data["server_public_ephemeral"]),
            challenge.data["srp_salt"],
            self.username,
            "wrong password",
        )
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "srp_session_id": challenge.data["srp_session_id"],
                "client_public_ephemeral": srp.hex_from_int(pow(srp.G, a, srp.N)),
                "client_proof": session["client_proof"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_unknown_user_challenge_returns_decoy(self):
        response = self.client.post(
            "/api/v1/auth/login/challenge/", {"username": "ghost"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("srp_salt", response.data)
        self.assertIn("server_public_ephemeral", response.data)
        self.assertEqual(len(response.data["server_public_ephemeral"]), 512)
        verify = self.client.post(
            "/api/v1/auth/login/",
            {
                "srp_session_id": response.data["srp_session_id"],
                "client_public_ephemeral": "05",
                "client_proof": "00" * 32,
            },
            format="json",
        )
        self.assertEqual(verify.status_code, 401)


class TokenTests(BaseAPITestCase):
    def setUp(self):
        self.tokens = register_user("alice", "correct horse battery")

    def test_me_with_access_token(self):
        client = self.client
        client.credentials(HTTP_AUTHORIZATION="Bearer {}".format(self.tokens["access"]))
        response = client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "alice")

    def test_me_without_token(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_refresh_rotation_and_reuse_detection(self):
        first = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": self.tokens["refresh"]}, format="json"
        )
        self.assertEqual(first.status_code, 200)
        second = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": first.data["refresh"]}, format="json"
        )
        self.assertEqual(second.status_code, 200)
        reused = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": first.data["refresh"]}, format="json"
        )
        self.assertEqual(reused.status_code, 401)
        invalidated = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": second.data["refresh"]}, format="json"
        )
        self.assertEqual(invalidated.status_code, 401)

    def test_refresh_garbage_token(self):
        response = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": "not-a-token"}, format="json"
        )
        self.assertEqual(response.status_code, 401)


class SessionTests(BaseAPITestCase):
    def setUp(self):
        register_user("alice", "correct horse battery")

    def login_new_session(self, device):
        client = self.client_class()
        return srp_login(client, "alice", "correct horse battery", device_name=device)
    def test_sessions_list_and_revoke(self):
        first = self.login_new_session("phone")
        second = self.login_new_session("laptop")
        client = self.client_class()
        client.credentials(HTTP_AUTHORIZATION="Bearer {}".format(second["access"]))
        sessions = client.get("/api/v1/auth/sessions/")
        self.assertEqual(sessions.status_code, 200)
        self.assertEqual(len(sessions.data), 3)
        current = next(item for item in sessions.data if item["current"])
        self.assertEqual(current["device_name"], "laptop")
        other = next(item for item in sessions.data if not item["current"])
        revoke = client.delete("/api/v1/auth/sessions/{}/".format(other["id"]))
        self.assertEqual(revoke.status_code, 204)
        revoked_refresh = self.client_class().post(
            "/api/v1/auth/token/refresh/", {"refresh": first["refresh"]}, format="json"
        )
        self.assertEqual(revoked_refresh.status_code, 401)
        still_valid = self.client_class().post(
            "/api/v1/auth/token/refresh/", {"refresh": second["refresh"]}, format="json"
        )
        self.assertEqual(still_valid.status_code, 200)

    def test_logout_revokes_current_session(self):
        tokens = self.login_new_session("phone")
        client = self.client_class()
        client.credentials(HTTP_AUTHORIZATION="Bearer {}".format(tokens["access"]))
        response = client.post("/api/v1/auth/logout/", {}, format="json")
        self.assertEqual(response.status_code, 204)
        me = client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 401)

    def test_logout_all(self):
        self.login_new_session("phone")
        self.login_new_session("laptop")
        third = self.login_new_session("tablet")
        client = self.client_class()
        client.credentials(HTTP_AUTHORIZATION="Bearer {}".format(third["access"]))
        response = client.post("/api/v1/auth/logout-all/", {}, format="json")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Session.objects.filter(revoked_at__isnull=True).count(), 0)


class PasswordChangeTests(BaseAPITestCase):
    def setUp(self):
        self.username = "alice"
        self.old_password = "correct horse battery"
        self.new_password = "new strong password"
        register_user(self.username, self.old_password)

    def build_proof(self, purpose="reauth", password=None):
        challenge = self.client.post(
            "/api/v1/auth/login/challenge/",
            {"username": self.username, "purpose": purpose},
            format="json",
        )
        assert challenge.status_code == 200
        a = srp.generate_private_ephemeral()
        session = srp.client_session(
            a,
            srp.int_from_hex(challenge.data["server_public_ephemeral"]),
            challenge.data["srp_salt"],
            self.username,
            password or self.old_password,
        )
        return {
            "srp_session_id": challenge.data["srp_session_id"],
            "client_public_ephemeral": srp.hex_from_int(pow(srp.G, a, srp.N)),
            "client_proof": session["client_proof"],
        }

    def test_password_change_requires_reauth_and_rotates_verifier(self):
        other = srp_login(self.client_class(), self.username, self.old_password)
        client = self.client_class()
        tokens = srp_login(client, self.username, self.old_password)
        client.credentials(HTTP_AUTHORIZATION="Bearer {}".format(tokens["access"]))
        proof = self.build_proof()
        new_material = build_registration(self.username, self.new_password)
        response = client.post(
            "/api/v1/auth/password/change/",
            {
                **proof,
                "new_srp_salt": new_material["srp_salt"],
                "new_srp_verifier": new_material["srp_verifier"],
                "new_wrapped_private_key": "b64rewrapped",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        user = User.objects.get(username=self.username)
        self.assertEqual(user.wrapped_private_key, "b64rewrapped")
        old_client = self.client_class()
        old_login = try_srp_login(old_client, self.username, self.old_password)
        self.assertEqual(old_login.status_code, 401)
        other_refresh = old_client.post(
            "/api/v1/auth/token/refresh/", {"refresh": other["refresh"]}, format="json"
        )
        self.assertEqual(other_refresh.status_code, 401)
        still_current = client.get("/api/v1/auth/me/")
        self.assertEqual(still_current.status_code, 200)
        fresh = srp_login(self.client_class(), self.username, self.new_password)
        self.assertIn("access", fresh)

    def test_password_change_rejects_wrong_password_proof(self):
        client = self.client_class()
        tokens = srp_login(client, self.username, self.old_password)
        client.credentials(HTTP_AUTHORIZATION="Bearer {}".format(tokens["access"]))
        proof = self.build_proof(password="wrong password")
        response = client.post(
            "/api/v1/auth/password/change/",
            {**proof, "new_srp_salt": "cd" * 16, "new_srp_verifier": "ab" * 64},
            format="json",
        )
        self.assertEqual(response.status_code, 401)


class AccountDeleteTests(BaseAPITestCase):
    def test_delete_account_requires_reauth(self):
        client, _ = login_and_get_client("alice", "correct horse battery")
        response = client.post("/api/v1/auth/account/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_delete_account_removes_user(self):
        client, _ = login_and_get_client("alice", "correct horse battery")
        from apps.notes.models import Note

        user_id = client.get("/api/v1/auth/me/").data["id"]
        Note.objects.create(
            id="4f9f6a4e-0d3e-4f6a-8b1e-3c9e1f6a9c11", user_id=user_id, content="cipher"
        )
        proof_challenge = client.post(
            "/api/v1/auth/login/challenge/", {"username": "alice", "purpose": "reauth"}, format="json"
        )
        self.assertEqual(proof_challenge.status_code, 200)
        a = srp.generate_private_ephemeral()
        session = srp.client_session(
            a,
            srp.int_from_hex(proof_challenge.data["server_public_ephemeral"]),
            proof_challenge.data["srp_salt"],
            "alice",
            "correct horse battery",
        )
        response = client.post(
            "/api/v1/auth/account/",
            {
                "srp_session_id": proof_challenge.data["srp_session_id"],
                "client_public_ephemeral": srp.hex_from_int(pow(srp.G, a, srp.N)),
                "client_proof": session["client_proof"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(username="alice").exists())
        self.assertFalse(Note.objects.exists())
