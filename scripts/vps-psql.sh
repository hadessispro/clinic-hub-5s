#!/usr/bin/env bash
VPS_HOST="${VPS_HOST:-root@31.97.191.177}"
VPS_KEY="$HOME/.ssh/clinic_hub_deploy_key"
ssh -i "$VPS_KEY" -o BatchMode=yes "$VPS_HOST" "cd /opt/clinic-hub-5s && docker compose --env-file .env.vps exec -T postgres sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB'"
