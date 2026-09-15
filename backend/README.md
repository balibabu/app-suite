# appsuite-backend

API-only backend for an end-to-end encrypted (E2EE) app suite: **notes**, **tasks**, and **file storage**. Built with Django + Django REST Framework, SQLite, JWT session tokens, and SRP-6a zero-knowledge authentication.

The server stores only ciphertext for user content. All encryption, key derivation, and decryption happen on the client.

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

## Setup

```bash
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

API base URL: `http://localhost:8000/api/v1`

Run tests:

```bash
uv run python manage.py test
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `APPSUITE_SECRET_KEY` | dev value | Django secret key (also seeds decoy responses and default JWT secret) |
| `APPSUITE_JWT_SECRET` | secret key | Dedicated HMAC key for access tokens |
| `APPSUITE_DEBUG` | `true` | Debug mode |
| `APPSUITE_ALLOWED_HOSTS` | `*` | Comma-separated hosts |
| `APPSUITE_DB_PATH` | `db.sqlite3` | SQLite file path |
| `APPSUITE_MEDIA_ROOT` | `./media` | Encrypted file blobs directory |
| `APPSUITE_MAX_FILE_SIZE` | `104857600` | Max single upload size in bytes (100 MiB) |
| `APPSUITE_USER_STORAGE_LIMIT` | `1073741824` | Per-user storage quota in bytes (1 GiB) |
| `APPSUITE_CORS_ORIGINS` | localhost dev origins | Comma-separated allowed origins |
| `APPSUITE_CORS_ALLOW_ALL` | value of `APPSUITE_DEBUG` | Allow all origins |
| `APPSUITE_TRUST_X_FORWARDED_FOR` | `false` | Use `X-Forwarded-For` for client IP |
| `APPSUITE_ALLOW_SIGNUP` | `true` | Allow new user registration via the API |

## E2EE architecture

- The client generates a random master key. All notes, tasks, task lists, and file metadata/bodies are encrypted client-side (recommended: AES-256-GCM with random nonces) before upload.
- The master private key is wrapped (encrypted) with a key derived from the password and stored on the server as `wrapped_private_key`, enabling multi-device login without the server ever seeing plaintext keys.
- The server never receives the password. Authentication uses SRP-6a: the server stores only a verifier, and verifies proof-of-knowledge each login.
- Password change re-wraps the private key client-side and uploads new SRP material.

### SRP-6a parameters (exact)

| Item | Value |
|---|---|
| Group | RFC 5054 2048-bit safe prime (hex in `apps/common/srp.py`) |
| Generator | `g = 2` |
| Hash | SHA-256 over concatenated big-endian bytes |
| `pad(x)` | integer serialized to exactly 256 bytes |
| `k` | `SHA-256(pad(N) || pad(g))` |
| `u` | `SHA-256(pad(A) || pad(B))` |
| Private key `x` | `SHA-256(bytes.fromhex(salt) || SHA-256(username || ":" || password))` — username is the normalized lowercase username |
| Verifier `v` | `pow(g, x, N)` |
| Server public `B` | `(k * v + pow(g, b, N)) mod N` |
| Premaster `S` | server: `pow(A * pow(v, u, N), b, N)`; client: `pow(B - k * pow(g, x, N), a + u*x, N) mod N` |
| Session key `K` | `SHA-256(pad(S))` |
| Client proof `M1` | `SHA-256(pad(A) || pad(B) || K)` |
| Server proof `M2` | `SHA-256(pad(A) || M1 || K)` |

All integers cross the wire as lower-case hex strings, zero-padded to 512 chars (except `client_proof`, which is 64 hex chars).

### Recommended client crypto (WebCrypto-compatible)

```
registration:
  salt          <- 16 random bytes (hex)
  x             <- per SRP spec above
  verifier      <- pow(g, x, N)
  masterKey     <- 32 random bytes                    (never sent)
  wrappingKey   <- PBKDF2(password, salt, 250k iters, SHA-256)
  wrappedPrivateKey <- AES-256-GCM(wrappingKey, masterKey)
  identity_public_key <- public half of an Ed25519/X25519 keypair (opaque to server)

item encryption:
  nonce  <- 12 random bytes
  blob   <- base64(nonce || AES-256-GCM(masterKey, nonce, plaintext))
```

Encrypt each item independently. Store the produced `blob` string in the `content` / `meta_ciphertext` fields.

## Authentication flow

```
1. POST /auth/register/            username, srp_salt, srp_verifier,
                                   identity_public_key, wrapped_private_key
                            201 <- user + access/refresh tokens

2. POST /auth/login/challenge/     username, purpose ("login"|"reauth")
                            200 <- srp_session_id, srp_salt, server_public_ephemeral (B)

3. POST /auth/login/               srp_session_id, client_public_ephemeral (A),
                                   client_proof (M1), device_name
                            200 <- server_proof (M2), user, access/refresh tokens
                                   (verify M2 before trusting the session)
```

Unknown usernames receive a deterministic decoy challenge so the endpoint does not leak account existence; their login verify always fails with the same `invalid credentials` error.

- **Access token**: JWT, HS256, `Authorization: Bearer <token>`, 15 min lifetime.
- **Refresh token**: `<session_id>.<secret>`, 30-day rolling lifetime, rotated on every refresh. Replaying a rotated refresh token revokes the whole session (reuse detection).

Re-auth (password change, account deletion): request a challenge with `purpose: "reauth"`, build a proof with the current password, and send it with the endpoint payload.

## API reference

Errors use DRF conventions: `{"detail": "...", "code": "..."}` where applicable. Auth endpoints are rate-limited (`auth_login` 15/min, `auth` 60/min per IP).

Common item fields (notes, task lists, tasks, files):

| Field | Meaning |
|---|---|
| `id` | Client-generated UUID (required on create) |
| `content` / `meta_ciphertext` | Client-encrypted ciphertext blob |
| `format_version` | Client crypto scheme version (default 1) |
| `item_version` | Server counter, increments on every write |
| `deleted_at` | Set while in trash (tombstone) |
| `created_at` / `updated_at` | Server timestamps (UTC) |

### Auth

| Method & path | Body | Notes |
|---|---|---|
| `POST /auth/register/` | see flow above | `409 username_taken` |
| `POST /auth/login/challenge/` | `{username, purpose}` | 200 with decoy for unknown users |
| `POST /auth/login/` | see flow above | `401` on any failure |
| `POST /auth/token/refresh/` | `{refresh}` | Rotates refresh; reuse revokes session |
| `POST /auth/logout/` | `{refresh?}` (auth) | Revokes given session or the current one |
| `POST /auth/logout-all/` | (auth) | Revokes every session |
| `GET /auth/me/` | (auth) | Profile, `storage_used`, `storage_limit`, `wrapped_private_key` |
| `GET /auth/sessions/` | (auth) | Active sessions with `current` flag |
| `DELETE /auth/sessions/{id}/` | (auth) | Revoke one session |
| `POST /auth/password/change/` | reauth proof + `new_srp_salt`, `new_srp_verifier`, `new_wrapped_private_key` | Revokes all other sessions |
| `POST /auth/account/` | reauth proof | Deletes account and all data |

### Notes / tasks / files

Identical sync semantics for all three resources:

| Method & path | Behavior |
|---|---|
| `GET /` | List. Query params: `updated_since=<ISO8601 with tz>` (delta sync incl. tombstones), `trash=true` (deleted only). Default: active items ordered by `updated_at`. |
| `POST /` | Create with client `id`. `409 exists` if the id is taken. |
| `GET /{id}/` | Fetch one. |
| `PUT /{id}/` | Upsert (create if missing, `201`). Optional `base_version`: if it does not match the server's `item_version` → `409 version_conflict` with `current` embedded. Without `base_version` the write is last-write-wins. Overwriting a trashed item restores it. |
| `DELETE /{id}/` | Soft-delete to trash. `?purge=true` permanently deletes. |
| `POST /{id}/restore/` | Un-trash. |

Routes:

- `POST/GET/PUT/DELETE /notes/...`
- `POST/GET/PUT/DELETE /tasks/lists/...` — task lists
- `POST/GET/PUT/DELETE /tasks/tasks/...` — tasks; extra field `task_list` (UUID or null); filter `?task_list=<uuid|none>`; purging a list moves its tasks to inbox (`task_list: null`)
- `POST/GET/PUT/DELETE /files/...` — file records with `meta_ciphertext` (encrypted name/mime etc.), plus binary content endpoints below

### File content

```
POST   /files/{id}/content/                    (raw encrypted bytes, application/octet-stream)
GET    /files/{id}/content/                    (streams the stored bytes)
```

- Create the file record (`POST /files/`) first; `PUT` content once (`409 content_exists` afterwards, content is immutable — upload a new file id to replace).
- Uploads fail with `413` when exceeding `APPSUITE_MAX_FILE_SIZE` or the remaining storage quota.
- Trashed files refuse uploads (`409 item_deleted`) but content stays downloadable until purged; purging frees quota.
- `GET /auth/me/` reports `storage_used` / `storage_limit`.

### Sync pattern for clients

1. Full sync: `GET` each collection, decrypt, replace local store.
2. Record the max `updated_at` per collection.
3. Delta sync: `GET <collection>/?updated_since=<timestamp>` (URL-encode the `+` in the timezone offset, or use `Z`). Apply upserts and tombstones (`deleted_at` set).
4. Local edits: `PUT` with `base_version` = last seen `item_version`; on `409 version_conflict` merge client-side against the returned `current` and retry without `base_version` to force last-write-wins.

## Project layout

```
config/            settings, root urls, health, JSON error handlers
apps/common/       SRP-6a, JWT auth, sync item base model + viewset
apps/accounts/     user, sessions, register/login/refresh/password APIs
apps/notes/        encrypted notes
apps/tasks/        encrypted task lists + tasks
apps/files/        encrypted file records + binary storage, quota
```
