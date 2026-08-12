create table if not exists marketing.pg_location_suggestions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references marketing.pg_shift_assignments(id) on delete cascade,
  pg_code text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m integer not null check (accuracy_m between 1 and 500),
  address text,
  note text,
  status text not null default 'pending_admin' check (status in ('pending_admin','approved','rejected')),
  reviewed_by_code text,
  reviewed_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pg_location_suggestions_queue_idx
  on marketing.pg_location_suggestions(status, created_at desc);
create unique index if not exists pg_location_suggestions_one_pending_idx
  on marketing.pg_location_suggestions(pg_code, assignment_id) where status='pending_admin';

create table if not exists marketing.pg_support_requests (
  id uuid primary key default gen_random_uuid(),
  pg_code text not null,
  request_type text not null check (request_type in ('location_issue','schedule_change','account_access','data_issue','other')),
  title text not null,
  detail text not null,
  status text not null default 'submitted' check (status in ('submitted','admin_review','approved','rejected','in_progress','completed')),
  support_code text,
  support_note text,
  admin_code text,
  admin_note text,
  resolution text,
  forwarded_at timestamptz,
  decided_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pg_support_requests_queue_idx
  on marketing.pg_support_requests(status, created_at desc);
create index if not exists pg_support_requests_pg_idx
  on marketing.pg_support_requests(pg_code, created_at desc);
