#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/clinic-hub-5s}"
REPOSITORY="${REPOSITORY:-https://github.com/hadessispro/clinic-hub-5s.git}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root or with sudo." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  apt-get update
  apt-get install -y git curl ca-certificates
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

docker compose version >/dev/null
mkdir -p "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPOSITORY" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin main
git checkout main
git pull --ff-only origin main

if [ ! -f .env.vps ]; then
  cp .env.vps.example .env.vps
  chmod 600 .env.vps
  echo "Created $APP_DIR/.env.vps. Fill its secrets, then run this script again." >&2
  exit 2
fi

docker compose --env-file .env.vps build --pull
docker compose --env-file .env.vps up -d --remove-orphans
docker compose ps
docker compose exec -T api wget -qO- http://127.0.0.1:3000/healthz
