# Supabase to VPS shadow migration

Supabase remains the production source for authentication, database access,
storage and realtime. PostgreSQL, Redis and NestJS run only on the private
Docker network until a cutover is explicitly approved.

## Start the shadow services

```sh
docker compose --env-file .env.vps up -d --build postgres redis backend
docker compose --env-file .env.vps ps
docker compose --env-file .env.vps exec -T backend wget -qO- http://127.0.0.1:4000/healthz
```

## Import and reconcile

The importer reads Supabase with the server-side key and writes a lossless
JSONB copy into `migration.raw_records`. It does not write to Supabase.

```sh
docker compose --env-file .env.vps exec -T backend node apps/backend/dist/import.js
docker compose --env-file .env.vps exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "select table_name, count(*) from migration.raw_records group by table_name order by table_name;"
docker compose --env-file .env.vps exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "select id, status, started_at, finished_at, stats from migration.import_runs order by started_at desc limit 1;"
```

Every imported table records the Supabase count, PostgreSQL count and a
`matchesSource` flag. Missing optional tables are reported as skipped instead
of stopping the whole run.

## Safety boundary

- Do not route Caddy or the frontend to `backend` yet.
- Do not disable Supabase Auth, Storage, Realtime or database access.
- Do not treat PostgreSQL as authoritative until repeated reconciliation is
  clean and a rollback-tested cutover is approved.
