#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

SERVICE="${APPSUITE_SERVICE:-appsuite}"

echo "==> pulling latest code"
git pull --ff-only

echo "==> installing backend dependencies"
cd backend
uv sync

echo "==> applying database migrations"
uv run python manage.py migrate

echo "==> building frontend"
cd ../frontend
npm ci
npm run build

echo "==> collecting static files"
cd ../backend
uv run python manage.py collectstatic --noinput --clear

echo "==> restarting service"
if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}.service"; then
  if [ "$(id -u)" -eq 0 ]; then
    systemctl restart "$SERVICE"
  else
    sudo systemctl restart "$SERVICE"
  fi
  echo "restarted ${SERVICE}.service"
else
  echo "no systemd service named '${SERVICE}' found, restart your process manually"
fi

echo "==> done"
