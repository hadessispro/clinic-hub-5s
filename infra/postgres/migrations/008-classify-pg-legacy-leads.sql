-- Source rule: CS is always Net chuyen sau. CB is Net co ban only when the
-- source has appointment content; otherwise it remains Data tho. Appointment
-- text may be informal (for example "Hen 12/7"), so it is preserved in the
-- customer portrait even when it cannot be converted into appointment_at.
begin;

alter table marketing.leads drop constraint if exists leads_check;
alter table marketing.leads
  add constraint leads_check check (
    data_class = 'raw'
    or (
      phone is not null
      and length(regexp_replace(phone, '\D', '', 'g')) >= 8
      and net_level in ('basic', 'advanced')
    )
  );

update marketing.leads lead
set appointment_at = case
      when trim(coalesce(source.payload->>'appointment_date','')) ~ '^[0-3]?[0-9]/[0-1]?[0-9]/20[0-9]{2}[[:space:]][0-2]?[0-9]:[0-5][0-9]$'
      then to_timestamp(trim(source.payload->>'appointment_date'), 'DD/MM/YYYY HH24:MI') at time zone 'Asia/Ho_Chi_Minh'
      else null end,
    data_class = case
      when lower(trim(source.payload->>'data_type')) = 'cs' then 'net'
      when lower(trim(source.payload->>'data_type')) = 'cb'
       and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'net'
      else 'raw' end,
    net_level = case
      when lower(trim(source.payload->>'data_type')) = 'cs' then 'advanced'
      when lower(trim(source.payload->>'data_type')) = 'cb'
       and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'basic'
      else null end,
    updated_at = now()
from source_pg.customers source
where lead.external_source = 'pg_nhakhoa5s_mysql'
  and lead.external_id = source.source_id::text
  and lower(trim(coalesce(source.payload->>'data_type', ''))) in ('cb', 'cs');

commit;
