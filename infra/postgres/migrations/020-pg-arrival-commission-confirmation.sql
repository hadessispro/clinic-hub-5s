-- Support PG confirmation layer. Additive only; legacy arrival/commission data is preserved.
alter table marketing.leads
  add column if not exists pg_arrival_confirmed_at timestamptz,
  add column if not exists pg_arrival_confirmed_by text,
  add column if not exists pg_commission_status text not null default 'pending_confirmation';

do $$ begin
  alter table marketing.leads add constraint marketing_leads_pg_commission_status_check
    check (pg_commission_status in ('pending_confirmation','eligible','paid','rejected'));
exception when duplicate_object then null;
end $$;

create index if not exists marketing_leads_pg_commission_filter_idx
  on marketing.leads(pg_commission_status,created_by_pg_code,pg_arrival_confirmed_at desc);

comment on column marketing.leads.pg_arrival_confirmed_at is 'Thời điểm Support PG xác nhận khách thực tế đã đến';
comment on column marketing.leads.pg_arrival_confirmed_by is 'Mã nhân sự Support/Admin thực hiện xác nhận';
comment on column marketing.leads.pg_commission_status is 'Trạng thái đủ điều kiện đối soát hoa hồng PG';
