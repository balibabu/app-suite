from django.test import TestCase

from apps.common import srp


class SrpTests(TestCase):
    def setUp(self):
        self.salt = "ab" * 16
        self.username = "alice"
        self.password = "correct horse battery staple"

    def test_full_roundtrip(self):
        private_key = srp.derive_private_key(self.salt, self.username, self.password)
        verifier = srp.derive_verifier(private_key)
        server_private, server_public = srp.generate_server_ephemeral(verifier)
        client_private = srp.generate_private_ephemeral()
        client_public = pow(srp.G, client_private, srp.N)
        server = srp.server_session(server_private, client_public, verifier)
        client = srp.client_session(client_private, server_public, self.salt, self.username, self.password)
        self.assertEqual(server["key"], client["key"])
        self.assertEqual(server["client_proof"], client["client_proof"])
        self.assertEqual(server["server_proof"], client["server_proof"])
        self.assertTrue(srp.proofs_match(server["client_proof"], client["client_proof"]))

    def test_wrong_password_derives_different_proof(self):
        private_key = srp.derive_private_key(self.salt, self.username, self.password)
        verifier = srp.derive_verifier(private_key)
        server_private, server_public = srp.generate_server_ephemeral(verifier)
        client_private = srp.generate_private_ephemeral()
        client_public = pow(srp.G, client_private, srp.N)
        server = srp.server_session(server_private, client_public, verifier)
        client = srp.client_session(client_private, server_public, self.salt, self.username, "wrong")
        self.assertNotEqual(server["client_proof"], client["client_proof"])

    def test_hex_roundtrip(self):
        value = srp.generate_private_ephemeral()
        encoded = srp.hex_from_int(value)
        self.assertEqual(len(encoded), 512)
        self.assertEqual(srp.int_from_hex(encoded), value)
