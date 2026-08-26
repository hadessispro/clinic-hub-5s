create table if not exists marketing.gift_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null default 'Quà tặng khách hàng',
  unit text not null default 'phần',
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  note text,
  created_by_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing.gift_stock_movements (
  id uuid primary key default gen_random_uuid(),
  gift_item_id uuid not null references marketing.gift_items(id),
  movement_type text not null check (movement_type in ('stock_in','issue','return','adjustment_in','adjustment_out','legacy_issue')),
  quantity integer not null check (quantity > 0),
  affects_stock boolean not null default true,
  recipient_name text,
  recipient_phone text,
  customer_profile_id uuid references marketing.customer_profiles(id) on delete set null,
  lead_id uuid references marketing.leads(id) on delete set null,
  pg_code text,
  branch_id text,
  note text,
  occurred_at timestamptz not null default now(),
  created_by_code text not null,
  created_by_role text not null,
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  unique(external_source, external_id)
);

create index if not exists gift_stock_movements_item_time_idx on marketing.gift_stock_movements(gift_item_id, occurred_at desc);
create index if not exists gift_stock_movements_recipient_idx on marketing.gift_stock_movements(lower(recipient_name), occurred_at desc);
create index if not exists gift_stock_movements_pg_time_idx on marketing.gift_stock_movements(lower(pg_code), occurred_at desc);
create index if not exists gift_stock_movements_phone_idx on marketing.gift_stock_movements(regexp_replace(coalesce(recipient_phone,''), '\\D', '', 'g'));
