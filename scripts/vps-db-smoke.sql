select 'migrations' metric, count(*)::text value from app.schema_migrations;
select 'marketing_tables' metric, count(*)::text value from information_schema.tables where table_schema='marketing';
select 'profiles' metric, count(*)::text value from app.records where entity_type='profiles' and deleted_at is null;
select coalesce(payload->>'role','unknown') role, count(*) from app.records
where entity_type='profiles' and deleted_at is null group by payload->>'role' order by role;
select id,customer_name,data_class,assigned_telesale_code from marketing.leads where source='smoke-test';
