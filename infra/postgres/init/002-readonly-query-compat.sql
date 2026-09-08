-- Compatibility objects for rebuilding a database from an empty volume.
--
-- Migration 039 revokes read access from two historical snapshot tables that
-- exist on the long-running production database. They were never created by
-- the reproducible schema, so a clean CI database stopped before it could run
-- the remaining migrations. Empty placeholders keep the security migration
-- valid without changing the already-signed migration or exposing data.

create schema if not exists marketing;

create table if not exists marketing.customer_profiles_backup_20260820 (
  snapshot_id bigint generated always as identity primary key,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists marketing.leads_backup_20260820 (
  snapshot_id bigint generated always as identity primary key,
  payload jsonb not null default '{}'::jsonb
);
