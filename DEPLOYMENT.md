# Production deployment guide

This app ships as a single Django process that serves **both** the API (`/api/v1/...`) and the built frontend (SPA) from the same origin. Configuration lives in gitignored `.env` files, so your production settings survive every `git pull`.

```
browser ──> gunicorn (Django)
              ├── /api/v1/...      JSON API
              ├── /static/...      built frontend assets (whitenoise)
              └── anything else    frontend/dist/index.html (SPA routes)
```

## 1. Prerequisites

- A Linux server with SSH access
- [uv](https://docs.astral.sh/uv/) (Python): `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Node.js 20+ and npm
- git

## 2. First-time setup

### Clone and configure

```bash
git clone <your-repo-url> /opt/appsuite
cd /opt/appsuite
```

Create the backend env file (this file is gitignored, `git pull` will never touch it):

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set real values:

```env
APPSUITE_SECRET_KEY=<output of: openssl rand -hex 32>
APPSUITE_JWT_SECRET=<output of: openssl rand -hex 32>
APPSUITE_DEBUG=False
APPSUITE_ALLOWED_HOSTS=your-domain.com
APPSUITE_TRUST_X_FORWARDED_FOR=True
```

- `APPSUITE_ALLOWED_HOSTS` must list your domain (and/or server IP).
- `APPSUITE_TRUST_X_FORWARDED_FOR=True` is needed when behind nginx for correct client IPs in rate limiting.
- Leave `APPSUITE_CORS_ORIGINS` empty — frontend and API share one origin, so CORS is not needed.

The frontend normally needs no env file: production builds call the API at the same origin (`/api/v1`). Only set `VITE_API_URL` (in `frontend/.env`) if you host the API on a different domain.

### Initialize and build

```bash
uv sync
uv run python manage.py migrate

cd ../frontend
npm ci
npm run build

cd ../backend
uv run python manage.py collectstatic --noinput --clear
```

### Smoke test

```bash
cd /opt/appsuite/backend
APPSUITE_ALLOWED_HOSTS=localhost uv run gunicorn config.wsgi -b 0.0.0.0:8000
```

Then check:

- `curl http://localhost:8000/api/v1/health/` → `{"status": "ok", ...}`
- `http://server-ip:8000/` in a browser → loads the app

## 3. Run as a service (systemd)

Create `/etc/systemd/system/appsuite.service`:

```ini
[Unit]
Description=App Suite (Django + SPA)
After=network.target

[Service]
WorkingDirectory=/opt/appsuite/backend
ExecStart=/opt/appsuite/backend/.venv/bin/gunicorn config.wsgi --workers 3 --bind 127.0.0.1:8000
Restart=always
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now appsuite
```

The unit reads `backend/.env` itself via Django settings, no env vars needed in the unit.

## 4. Put nginx in front (recommended, TLS)

```nginx
server {
    server_name your-domain.com;

    client_max_body_size 110M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```

`client_max_body_size` must exceed `APPSUITE_MAX_FILE_SIZE` (100 MiB by default). Then enable TLS:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 5. Updating production

From the repo root on the server:

```bash
./deploy.sh
```

The script runs, in order:

1. `git pull` (your `.env`, database, and uploads are never touched — they are gitignored)
2. `uv sync` (new Python dependencies)
3. `python manage.py migrate` (database migrations)
4. `npm ci && npm run build` (frontend build)
5. `collectstatic --clear` (refreshes hashed assets, removes stale ones)
6. `systemctl restart appsuite` (if the systemd service exists; uses `sudo` when needed)

If you named the service differently, run `APPSUITE_SERVICE=yourservice ./deploy.sh`.

## 6. Backups

Everything stateful lives in two places (plus the env file):

- `backend/db.sqlite3` — users, metadata (ciphertext only)
- `backend/media/` — encrypted file blobs
- `backend/.env` — secrets

Example cron backup:

```bash
0 3 * * * tar -czf /backups/appsuite-$(date +\%F).tar.gz -C /opt/appsuite/backend db.sqlite3 media .env
```

## 7. Environment variables reference

Backend (`backend/.env`, loaded by Django on startup):

| Variable | Production value |
|---|---|
| `APPSUITE_SECRET_KEY` | random 64-hex string (required) |
| `APPSUITE_JWT_SECRET` | random 64-hex string (required) |
| `APPSUITE_DEBUG` | `False` |
| `APPSUITE_ALLOWED_HOSTS` | your domain |
| `APPSUITE_CORS_ORIGINS` | empty (same-origin) |
| `APPSUITE_DB_PATH` | optional custom sqlite path |
| `APPSUITE_MEDIA_ROOT` | optional custom upload dir |
| `APPSUITE_MAX_FILE_SIZE` | max upload in bytes (default 100 MiB) |
| `APPSUITE_USER_STORAGE_LIMIT` | per-user quota in bytes (default 1 GiB) |
| `APPSUITE_TRUST_X_FORWARDED_FOR` | `True` behind nginx |
| `APPSUITE_ALLOW_SIGNUP` | `True` to allow open registration, `False` for invite-only/private server |

Frontend (`frontend/.env`, baked in at build time):

| Variable | Production value |
|---|---|
| `VITE_API_URL` | unset (same-origin `/api/v1`) or full URL to external API |

## 8. Development vs production

- **Dev (this repo, unchanged):** no `.env` needed — Django defaults to `DEBUG=True` with localhost CORS, Vite dev server talks to `http://localhost:8000/api/v1`.
- **Production:** everything comes from `backend/.env`; the built SPA is served by Django; no Vite involved.
