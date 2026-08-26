create table if not exists marketing.gift_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  description text,
  color text not null default '#0f8b7c',
  active boolean not null default true,
  created_by_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into marketing.gift_categories(code,name,description,color,created_by_code) values
  ('VOUCHER_DV','Voucher dịch vụ','Phiếu sử dụng dịch vụ hoặc quyền lợi tại phòng khám.','#0f8b7c','SYSTEM'),
  ('QUA_HIEN_VAT','Quà hiện vật','Quà tặng hữu hình được nhập và xuất theo số lượng.','#2878d0','SYSTEM'),
  ('PHIEU_UU_DAI','Phiếu ưu đãi','Mã hoặc phiếu ưu đãi dành cho khách hàng.','#d98215','SYSTEM'),
  ('KHAC','Khác','Nhóm tạm cho quà tặng chưa thuộc danh mục chuyên biệt.','#667a76','SYSTEM')
on conflict(code) do update set name=excluded.name,description=excluded.description,color=excluded.color;

alter table marketing.gift_items add column if not exists category_id uuid references marketing.gift_categories(id);
create index if not exists gift_items_category_idx on marketing.gift_items(category_id,active,name);

-- The old source contains customer notes mentioning “xin voucher”, but has no
-- explicit gift/redeem event. Restore those care logs to their real event type.
update marketing.customer_journey_events
set event_type=coalesce(nullif(detail->>'sourceEventType',''),'legacy_customer_log'),
    event_category='legacy'
where external_source='pg_nhakhoa5s_mysql_customer_logs'
  and event_category='gift'
  and lower(coalesce(detail->>'sourceEventType','')) not similar to '%(gift|voucher|doi.?qua|redeem)%';

delete from marketing.gift_stock_movements
where movement_type='legacy_issue' and external_source='pg_nhakhoa5s_mysql_customer_logs';
delete from marketing.gift_items i where i.code='GIFT-LEGACY'
  and not exists(select 1 from marketing.gift_stock_movements m where m.gift_item_id=i.id);
