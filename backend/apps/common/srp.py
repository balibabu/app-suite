import hashlib
import hmac
import secrets

N = int(
    "AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050"
    "A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD5"
    "0E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93"
    "B855F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B147"
    "73BCA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F8"
    "7748544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E"
    "57AE6AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9D"
    "BFBB694B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73",
    16,
)
G = 2
KEY_LENGTH = 256


def _hash(*parts):
    hasher = hashlib.sha256()
    for part in parts:
        hasher.update(part)
    return hasher.digest()


def _pad(value):
    return value.to_bytes(KEY_LENGTH, "big")


def int_from_hex(value):
    return int(value, 16)


def hex_from_int(value):
    return format(value, "0{}x".format(KEY_LENGTH * 2))


def multiplier_k():
    return int.from_bytes(_hash(_pad(N), _pad(G)), "big")


def generate_private_ephemeral():
    return secrets.randbelow(N - 1) + 1


def generate_server_ephemeral(verifier):
    private = generate_private_ephemeral()
    public = (multiplier_k() * verifier + pow(G, private, N)) % N
    return private, public


def derive_private_key(salt_hex, username, password):
    inner = hashlib.sha256("{}:{}".format(username, password).encode()).digest()
    return int.from_bytes(_hash(bytes.fromhex(salt_hex), inner), "big")


def derive_verifier(private_key):
    return pow(G, private_key, N)


def _scrambling(public_a, public_b):
    u = int.from_bytes(_hash(_pad(public_a), _pad(public_b)), "big")
    if u == 0:
        raise ValueError("invalid scrambling parameter")
    return u


def server_session(server_private, client_public, verifier):
    if client_public % N == 0:
        raise ValueError("invalid client ephemeral")
    server_public = (multiplier_k() * verifier + pow(G, server_private, N)) % N
    u = _scrambling(client_public, server_public)
    shared = pow(client_public * pow(verifier, u, N), server_private, N)
    key = _hash(_pad(shared))
    client_proof = _hash(_pad(client_public), _pad(server_public), key)
    server_proof = _hash(_pad(client_public), client_proof, key)
    return {
        "key": key.hex(),
        "client_proof": client_proof.hex(),
        "server_proof": server_proof.hex(),
    }


def client_session(client_private, server_public, salt_hex, username, password):
    if server_public % N == 0:
        raise ValueError("invalid server ephemeral")
    client_public = pow(G, client_private, N)
    u = _scrambling(client_public, server_public)
    private_key = derive_private_key(salt_hex, username, password)
    base = (server_public - multiplier_k() * pow(G, private_key, N)) % N
    shared = pow(base, client_private + u * private_key, N)
    key = _hash(_pad(shared))
    client_proof = _hash(_pad(client_public), _pad(server_public), key)
    server_proof = _hash(_pad(client_public), client_proof, key)
    return {
        "key": key.hex(),
        "client_proof": client_proof.hex(),
        "server_proof": server_proof.hex(),
    }


def proofs_match(expected_hex, provided_hex):
    expected = expected_hex.strip().lower().encode()
    provided = provided_hex.strip().lower().encode()
    return hmac.compare_digest(expected, provided)
