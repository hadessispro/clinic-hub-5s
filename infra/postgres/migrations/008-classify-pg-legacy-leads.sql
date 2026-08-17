-- The imported PG source uses compact values: cb = net co ban, cs = net chuyen sau.
-- A lead is Net only when it also has a machine-readable appointment datetime.
-- Keep application-entered leads untouched; this only repairs the legacy import.
begin;

update marketing.leads lead
set appointment_at = to_timestamp(source.payload->>'appointment_date', 'DD/MM/YYYY HH24:MI') at time zone 'Asia/Ho_Chi_Minh',
    data_class = 'net',
    net_level = case lower(trim(source.payload->>'data_type')) when 'cb' then 'basic' when 'cs' then 'advanced' end,
    updated_at = now()
from source_pg.customers source
where lead.external_source = 'pg_nhakhoa5s_mysql'
  and lead.external_id = source.source_id::text
  and lower(trim(coalesce(source.payload->>'data_type', ''))) in ('cb', 'cs')
  and trim(coalesce(source.payload->>'appointment_date', '')) ~ '^[0-3][0-9]/[0-1][0-9]/20[0-9]{2}[[:space:]][0-2][0-9]:[0-5][0-9]$';

commit;
