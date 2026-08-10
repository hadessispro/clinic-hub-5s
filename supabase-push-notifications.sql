-- Run once in Supabase SQL Editor before enabling production Web Push.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions(user_id, active);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions select own" on public.push_subscriptions;
create policy "push subscriptions select own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push subscriptions insert own" on public.push_subscriptions;
create policy "push subscriptions insert own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push subscriptions update own" on public.push_subscriptions;
create policy "push subscriptions update own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push subscriptions delete own" on public.push_subscriptions;
create policy "push subscriptions delete own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

alter table public.notifications
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_attempts integer not null default 0,
  add column if not exists push_last_error text;

create index if not exists notifications_pending_push_idx
  on public.notifications(created_at)
  where push_sent_at is null;

