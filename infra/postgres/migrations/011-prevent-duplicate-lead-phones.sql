-- Keep historical rows untouched, but reject every new duplicate phone number.
-- The advisory transaction lock also closes the race between two devices that
-- submit the same phone at nearly the same time.
create index if not exists marketing_leads_phone_normalized_idx
  on marketing.leads ((regexp_replace(coalesce(phone,''),'\D','','g')))
  where length(regexp_replace(coalesce(phone,''),'\D','','g')) >= 8;

create or replace function marketing.prevent_duplicate_lead_phone()
returns trigger
language plpgsql
as $$
declare
  normalized_phone text;
begin
  normalized_phone := regexp_replace(coalesce(new.phone,''),'\D','','g');

  if length(normalized_phone) < 8 then
    raise exception using
      errcode = '23514',
      message = 'Số điện thoại không hợp lệ. Cần ít nhất 8 chữ số.',
      constraint = 'marketing_leads_phone_required_guard';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marketing.lead.phone:' || normalized_phone, 0));

  if exists (
    select 1
    from marketing.leads existing
    where regexp_replace(coalesce(existing.phone,''),'\D','','g') = normalized_phone
      and existing.id is distinct from new.id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Số điện thoại đã tồn tại trong hệ thống.',
      constraint = 'marketing_leads_phone_unique_guard';
  end if;

  new.phone := normalized_phone;
  return new;
end;
$$;

drop trigger if exists marketing_leads_prevent_duplicate_phone on marketing.leads;
create trigger marketing_leads_prevent_duplicate_phone
before insert or update of phone on marketing.leads
for each row execute function marketing.prevent_duplicate_lead_phone();
