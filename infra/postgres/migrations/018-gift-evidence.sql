-- Isolated, additive migration for gift handover evidence.
-- Existing gift movements and every unrelated domain table remain unchanged.
alter table marketing.gift_stock_movements
  add column if not exists customer_image_url text,
  add column if not exists customer_image_name text,
  add column if not exists receipt_url text,
  add column if not exists receipt_name text;

comment on column marketing.gift_stock_movements.customer_image_url is 'Ảnh xác nhận khách nhận/lấy quà';
comment on column marketing.gift_stock_movements.receipt_url is 'Ảnh bill, hóa đơn hoặc biên lai của giao dịch trao quà';
