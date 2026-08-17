#!/usr/bin/env sh
set -eu

MYSQL_CONTAINER="${MYSQL_CONTAINER:-clinic-pg-import}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinic-hub-5s-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-clinic_app}"
POSTGRES_DB="${POSTGRES_DB:-clinic_hub}"
WORK_DIR="${WORK_DIR:-/tmp/clinic-pg-etl}"
mkdir -p "$WORK_DIR"

# Export one JSON object per source row as HEX. HEX is deliberate: unlike
# TO_BASE64 it never inserts line breaks, so a row cannot corrupt COPY input.
export_table() {
  table="$1"
  output="$2"
  docker exec "$MYSQL_CONTAINER" mariadb --default-character-set=utf8mb4 -uroot --batch --raw --skip-column-names pg_source -e "
    set session group_concat_max_len=1000000;
    select group_concat(concat(quote(column_name), ',', char(96), replace(column_name,char(96),concat(char(96),char(96))), char(96)) order by ordinal_position separator ',') into @pairs
      from information_schema.columns where table_schema='pg_source' and table_name='$table';
    set @q=concat('select id,hex(json_object(',@pairs,')) from ',char(96),'$table',char(96),' order by id');
    prepare s from @q; execute s; deallocate prepare s;" > "$output"
}

export_table 39urY3_fspg_customers "$WORK_DIR/customers.tsv"
export_table 39urY3_fspg_pg_staff "$WORK_DIR/staff.tsv"
export_table 39urY3_fspg_customer_logs "$WORK_DIR/customer_logs.tsv"

docker cp "$WORK_DIR/customers.tsv" "$POSTGRES_CONTAINER:/tmp/pg-customers.tsv"
docker cp "$WORK_DIR/staff.tsv" "$POSTGRES_CONTAINER:/tmp/pg-staff.tsv"
docker cp "$WORK_DIR/customer_logs.tsv" "$POSTGRES_CONTAINER:/tmp/pg-customer-logs.tsv"

docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
begin;
select set_config('app.suppress_backup_outbox','on',true);
create temp table pg_import(source_id bigint,payload_hex text);
copy pg_import from '/tmp/pg-customers.tsv';
insert into source_pg.customers(source_id,payload,imported_at)
select source_id,convert_from(decode(payload_hex,'hex'),'utf8')::jsonb,now() from pg_import
on conflict(source_id) do update set payload=excluded.payload,imported_at=excluded.imported_at;
truncate pg_import;
copy pg_import from '/tmp/pg-staff.tsv';
insert into source_pg.staff(source_id,payload,imported_at)
select source_id,convert_from(decode(payload_hex,'hex'),'utf8')::jsonb,now() from pg_import
on conflict(source_id) do update set payload=excluded.payload,imported_at=excluded.imported_at;
truncate pg_import;
copy pg_import from '/tmp/pg-customer-logs.tsv';
insert into source_pg.customer_logs(source_id,payload,imported_at)
select source_id,convert_from(decode(payload_hex,'hex'),'utf8')::jsonb,now() from pg_import
on conflict(source_id) do update set payload=excluded.payload,imported_at=excluded.imported_at;

insert into marketing.customer_profiles(
 external_source,external_id,customer_code,customer_name,phone,service_need,booth,pg_name,telesale_name,
 customer_status,call_status,appointment_status,appointment_text,arrived,source_label,note,feedback,data_type,
 arrival_branch,low_quality,low_quality_reason,latest_telesale_note,vtech_service_type,vtech_service_date,
 vtech_service_revenue,vtech_service_sales,commission_status,raw_snapshot,source_created_at,source_updated_at)
select 'pg_nhakhoa5s_mysql',source_id::text,payload->>'customer_code',payload->>'customer_name',payload->>'phone',
 payload->>'service_need',payload->>'booth',payload->>'pg_name',payload->>'tele_name',
 coalesce(nullif(payload->>'tele_customer_status',''),payload->>'customer_status'),
 coalesce(nullif(payload->>'tele_call_status',''),payload->>'call_status'),
 coalesce(nullif(payload->>'tele_appointment_status',''),payload->>'appointment_status'),
 coalesce(nullif(payload->>'tele_appointment_date',''),payload->>'appointment_date'),
 coalesce(nullif(payload->>'tele_arrived_status','')::int,nullif(payload->>'arrived_status','')::int,0)=1,
 coalesce(nullif(payload->>'source',''),'PG Legacy'),payload->>'note',payload->>'feedback',payload->>'data_type',
 payload->>'arrival_branch',coalesce(nullif(payload->>'low_quality','')::int,0)=1,payload->>'low_quality_reason',
 payload->>'tele_note_latest',payload->>'vtech_service_type',nullif(payload->>'vtech_service_date','')::date,
 coalesce(nullif(payload->>'vtech_service_revenue','')::numeric,0),coalesce(nullif(payload->>'vtech_service_sales','')::numeric,0),
 payload->>'commission_status',payload,nullif(payload->>'created_at','')::timestamp at time zone 'Asia/Ho_Chi_Minh',
 nullif(payload->>'updated_at','')::timestamp at time zone 'Asia/Ho_Chi_Minh'
from source_pg.customers
on conflict(external_source,external_id) do update set
 customer_code=excluded.customer_code,customer_name=excluded.customer_name,phone=excluded.phone,
 service_need=excluded.service_need,booth=excluded.booth,pg_name=excluded.pg_name,telesale_name=excluded.telesale_name,
 customer_status=excluded.customer_status,call_status=excluded.call_status,appointment_status=excluded.appointment_status,
 appointment_text=excluded.appointment_text,arrived=excluded.arrived,source_label=excluded.source_label,note=excluded.note,
 feedback=excluded.feedback,data_type=excluded.data_type,arrival_branch=excluded.arrival_branch,
 low_quality=excluded.low_quality,low_quality_reason=excluded.low_quality_reason,
 latest_telesale_note=excluded.latest_telesale_note,vtech_service_type=excluded.vtech_service_type,
 vtech_service_date=excluded.vtech_service_date,vtech_service_revenue=excluded.vtech_service_revenue,
 vtech_service_sales=excluded.vtech_service_sales,commission_status=excluded.commission_status,
 raw_snapshot=excluded.raw_snapshot,source_updated_at=excluded.source_updated_at,updated_at=now();

-- Build a deterministic account map first. Existing people win by email, then
-- phone. Company/test placeholders stay in the restricted source snapshot.
with normalized as (
 select s.source_id,s.payload,
   lower(coalesce((regexp_match(coalesce(s.payload->>'staff_note',''),'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))[1],'')) email,
   regexp_replace(coalesce(s.payload->>'phone',''),'\D','','g') phone
 from source_pg.staff s
), existing as (
 select n.*,
   (select r.record_key from app.records r where r.entity_type='employees' and n.email<>'' and lower(coalesce(r.payload->>'email',''))=n.email limit 1) email_key,
   (select r.record_key from app.records r where r.entity_type='employees' and n.phone<>'' and regexp_replace(coalesce(r.payload->>'phone',''),'\D','','g')=n.phone limit 1) phone_key
 from normalized n
), resolved as (
 select source_id,
   case when lower(coalesce(payload->>'name','')) ~ '(công ty|company)' or lower(coalesce(payload->>'name','')) in ('admin','')
     then 'excluded' when email_key is not null then 'email' when phone_key is not null then 'phone' else 'new' end method,
   coalesce(email_key,phone_key,'pg-legacy-'||source_id) record_key,
   coalesce((select r.payload->>'code' from app.records r where r.entity_type='employees' and r.record_key=coalesce(email_key,phone_key)),
            'PG-LEGACY-'||coalesce(nullif(payload->>'user_id',''),source_id::text)) employee_code
 from existing
)
insert into source_pg.staff_account_map(source_id,employee_record_key,employee_code,match_method,matched_at)
select source_id,record_key,employee_code,method,now() from resolved
on conflict(source_id) do update set employee_record_key=excluded.employee_record_key,
 employee_code=excluded.employee_code,match_method=excluded.match_method,matched_at=now();

-- Business-approved identity overrides. Source user 1 is the technical
-- Marketing administrator and belongs to the existing Phan Ngọc Đức account.
update source_pg.staff_account_map m set
 employee_record_key=e.record_key,employee_code=e.payload->>'code',match_method='email',matched_at=now()
from app.records e
where m.source_id=8 and e.entity_type='employees' and lower(e.payload->>'code')='pvc-10162';

update app.records set payload=payload || jsonb_build_object(
 'department','marketing','role','admin_marketing','title','Admin Marketing',
 'managed_branches',jsonb_build_array('pham-van-chieu','le-van-tho'),'active',true
),updated_at=now(),version=version+1
where entity_type='profiles' and lower(coalesce(payload->>'employee_code',''))='pvc-10162';

-- Only create clean operational fields in app.records. CCCD, bank and image
-- URLs remain solely in source_pg.staff and are not exposed by the app API.
insert into app.records(entity_type,record_key,payload,origin,updated_at)
select 'employees',m.employee_record_key,
 jsonb_build_object('id',m.employee_record_key,'code',m.employee_code,'full_name',s.payload->>'name',
 'phone',regexp_replace(coalesce(s.payload->>'phone',''),'\D','','g'),
 'email',coalesce((regexp_match(coalesce(s.payload->>'staff_note',''),'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))[1],''),
 'department','marketing','title',case s.payload->>'role_type' when 'pg' then 'Nhân viên PG' when 'tele' then 'Telesale'
 when 'tele_manager' then 'Quản lý Telesale' else 'Quản lý Marketing' end,
 'role',case s.payload->>'role_type' when 'pg' then 'pg_staff' when 'tele' then 'telesale_staff'
 when 'tele_manager' then 'telesale_leader' else 'support_marketing' end,
 'branch_id','marketing','employment_type','field_marketing','status',case when s.payload->>'status'='active' then 'active' else 'inactive' end,
 'external_source','pg_nhakhoa5s_mysql','external_id',s.source_id::text),
 'pg_nhakhoa5s_mysql',now()
from source_pg.staff s join source_pg.staff_account_map m using(source_id)
where m.match_method='new'
on conflict(entity_type,record_key) do update set payload=excluded.payload,origin=excluded.origin,updated_at=now();

insert into app.records(entity_type,record_key,payload,origin,updated_at)
select 'profiles',m.employee_record_key,
 jsonb_build_object('id',m.employee_record_key,'employee_code',m.employee_code,'employee_number',m.employee_code,
 'full_name',s.payload->>'name','department','marketing','branch_id','marketing',
 'managed_branches',case when s.payload->>'role_type' in ('manager','tele_manager')
   then jsonb_build_array('pham-van-chieu','le-van-tho') else jsonb_build_array('marketing') end,
 'role',case s.payload->>'role_type' when 'pg' then 'pg_staff' when 'tele' then 'telesale_staff'
 when 'tele_manager' then 'telesale_leader' else 'support_marketing' end,
 'active',s.payload->>'status'='active','external_source','pg_nhakhoa5s_mysql','external_id',s.source_id::text),
 'pg_nhakhoa5s_mysql',now()
from source_pg.staff s join source_pg.staff_account_map m using(source_id)
where m.match_method='new'
on conflict(entity_type,record_key) do update set payload=excluded.payload,origin=excluded.origin,updated_at=now();

insert into marketing.leads(customer_name,phone,appointment_at,data_class,net_level,service_type,source,branch_id,notes,
 status,created_by_pg_code,assigned_telesale_code,created_at,updated_at,customer_profile_id,external_source,external_id)
select cp.customer_name,cp.phone,
 case when trim(coalesce(c.payload->>'appointment_date','')) ~ '^[0-3][0-9]/[0-1][0-9]/20[0-9]{2}[[:space:]][0-2][0-9]:[0-5][0-9]$'
      then to_timestamp(c.payload->>'appointment_date','DD/MM/YYYY HH24:MI') at time zone 'Asia/Ho_Chi_Minh' else null end,
 case when trim(coalesce(c.payload->>'appointment_date','')) ~ '^[0-3][0-9]/[0-1][0-9]/20[0-9]{2}[[:space:]][0-2][0-9]:[0-5][0-9]$'
        and lower(trim(coalesce(c.payload->>'data_type',''))) in ('cb','cs') then 'net' else 'raw' end,
 case when trim(coalesce(c.payload->>'appointment_date','')) ~ '^[0-3][0-9]/[0-1][0-9]/20[0-9]{2}[[:space:]][0-2][0-9]:[0-5][0-9]$'
   then case lower(trim(coalesce(c.payload->>'data_type',''))) when 'cb' then 'basic' when 'cs' then 'advanced' else null end
   else null end,
 cp.service_need,'PG Legacy',null,
 concat_ws(E'\n',nullif(cp.note,''),nullif(cp.feedback,''),nullif(cp.latest_telesale_note,'')),
 case when cp.arrived then 'visited' when coalesce(cp.appointment_status,'')<>'' then 'appointment_booked'
      when coalesce(cp.call_status,'')<>'' then 'contacted' else 'new' end,
 coalesce(pgmap.employee_code,'PG-SOURCE-'||coalesce(nullif(c.payload->>'pg_user_id',''),'UNKNOWN')),
 case when not coalesce(cp.arrived,false) and coalesce(cp.appointment_status,'')='' and coalesce(cp.call_status,'')=''
      then null else telemap.employee_code end,coalesce(cp.source_created_at,now()),
 coalesce(cp.source_updated_at,cp.source_created_at,now()),cp.id,cp.external_source,cp.external_id
from marketing.customer_profiles cp
join source_pg.customers c on c.source_id::text=cp.external_id
left join source_pg.staff pgs on pgs.payload->>'user_id'=c.payload->>'pg_user_id'
left join source_pg.staff_account_map pgmap on pgmap.source_id=pgs.source_id and pgmap.match_method<>'excluded'
left join source_pg.staff tels on tels.payload->>'user_id'=c.payload->>'tele_user_id'
left join source_pg.staff_account_map telemap on telemap.source_id=tels.source_id and telemap.match_method<>'excluded'
where cp.external_source='pg_nhakhoa5s_mysql'
on conflict(external_source,external_id) where external_source is not null and external_id is not null do update set customer_name=excluded.customer_name,phone=excluded.phone,
 appointment_at=excluded.appointment_at,data_class=excluded.data_class,net_level=excluded.net_level,service_type=excluded.service_type,notes=excluded.notes,status=excluded.status,
 created_by_pg_code=excluded.created_by_pg_code,assigned_telesale_code=excluded.assigned_telesale_code,
 customer_profile_id=excluded.customer_profile_id,updated_at=excluded.updated_at;
commit;
SQL

docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c \
 "select (select count(*) from source_pg.customers) source_customers,(select count(*) from marketing.customer_profiles where external_source='pg_nhakhoa5s_mysql') portraits,(select count(*) from marketing.leads where external_source='pg_nhakhoa5s_mysql') leads,(select count(*) from source_pg.staff) staff,(select count(*) from source_pg.staff_account_map where match_method='new') new_accounts;"
