-- Migration 053: Add customer_code to gift_stock_movements for duplicate checking
alter table marketing.gift_stock_movements
  add column if not exists customer_code text;

create index if not exists gift_stock_movements_customer_code_idx
  on marketing.gift_stock_movements(lower(trim(customer_code)));

comment on column marketing.gift_stock_movements.customer_code is 'Mã khách hàng nhận quà để kiểm tra trùng lặp';
