-- Treat local and international Vietnamese phone formats as one identity.
-- Examples: 0901234567, +84 901 234 567 and 0084-901-234-567.
create or replace function marketing.normalize_lead_phone(value text)
returns text
language plpgsql
immutable
strict
as $$
declare
  digits text := regexp_replace(value, '\D', '', 'g');
begin
  if digits like '0084%' then
    return '0' || substring(digits from 5);
  end if;
  if digits like '84%' then
    return '0' || substring(digits from 3);
  end if;
  return digits;
end;
$$;

drop index if exists marketing.marketing_leads_phone_normalized_idx;
create index marketing_leads_phone_normalized_idx
  on marketing.leads (marketing.normalize_lead_phone(phone))
  where length(marketing.normalize_lead_phone(phone)) >= 8;

create or replace function marketing.prevent_duplicate_lead_phone()
returns trigger
language plpgsql
as $$
declare
  normalized_phone text;
begin
  normalized_phone := marketing.normalize_lead_phone(coalesce(new.phone, ''));

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
    where marketing.normalize_lead_phone(existing.phone) = normalized_phone
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
