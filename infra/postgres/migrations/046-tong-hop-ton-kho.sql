-- ═══════════════════════════════════════════════════════════════════════════
-- TỔNG HỢP TỒN KHO · VẬT TƯ, HÀNG HÓA, CÔNG CỤ DỤNG CỤ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lưu trữ báo cáo và số liệu tổng hợp tồn kho chuẩn theo từng kho, mặt hàng:
-- Đầu kỳ (SL, Giá trị), Nhập kho (SL, Giá trị), Xuất kho (SL, Giá trị), Cuối kỳ.
-- Hỗ trợ import từ Tong_hop_ton_kho.xlsx và CRUD cho kế toán điều chỉnh.

begin;

create table if not exists finance.inventory_summary (
  id              uuid primary key default gen_random_uuid(),
  period_code     text not null default '2026-08',
  warehouse_name  text not null,
  item_code       text not null,
  item_name       text not null,
  unit            text,
  opening_qty     numeric(14, 3) not null default 0,
  opening_val     numeric(18, 2) not null default 0,
  in_qty          numeric(14, 3) not null default 0,
  in_val          numeric(18, 2) not null default 0,
  out_qty         numeric(14, 3) not null default 0,
  out_val         numeric(18, 2) not null default 0,
  closing_qty     numeric(14, 3) not null default 0,
  closing_val     numeric(18, 2) not null default 0,
  source_file     text,
  batch_id        uuid references finance.import_batches(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists inventory_summary_ky_kho_idx
  on finance.inventory_summary(period_code, warehouse_name);

create index if not exists inventory_summary_item_idx
  on finance.inventory_summary(item_code);

comment on table finance.inventory_summary is
  'Tổng hợp tồn kho theo kho và mặt hàng. Nguồn từ Tong_hop_ton_kho.xlsx hoặc kế toán nhập liệu.';

grant select, insert, update, delete on finance.inventory_summary to finance_app;

commit;
