-- Một tháng sổ sách thu nhỏ, hoàn toàn hợp lệ.
--
-- Dùng để chứng minh bat-bien-du-lieu.sql không báo động nhầm. Chạy phép thử
-- trên lược đồ trống thì mọi tổng đều bằng 0 và mọi bất biến đều đạt một cách
-- vô nghĩa: 0 = 0. Phải có dữ liệu thật thì phép thử mới nói được điều gì.
--
-- Dữ liệu ở đây cố tình chứa những trường hợp khó mà sổ thật có, để chắc rằng
-- phép thử chấp nhận chúng thay vì kêu oan:
--
--   · bút toán đỏ, ghi số âm cả hai vế, dùng khi hủy một bút toán đã ghi
--   · chứng từ nhiều dòng, một Nợ nhiều Có
--   · kỳ đã khóa có chứng từ ghi TRƯỚC lúc khóa, hợp lệ
--   · cây tài khoản ba cấp
--
-- Mã dùng ở đây bắt đầu bằng chữ để không đụng bat-bien.sql, file chạy sau
-- trên cùng database.

\set ON_ERROR_STOP on

-- ── Cây tài khoản ba cấp ───────────────────────────────────────────────────
insert into finance.accounts (code, name, nature, parent_code, depth) values
  ('111',  'Tiền mặt',                    'debit',  null,  1),
  ('131',  'Phải thu khách hàng',         'both',   null,  1),
  ('331',  'Phải trả người bán',          'both',   null,  1),
  ('511',  'Doanh thu bán hàng',          'credit', null,  1),
  ('632',  'Giá vốn hàng bán',            'debit',  null,  1),
  ('642',  'Chi phí quản lý doanh nghiệp','debit',  null,  1),
  ('6421', 'Chi phí nhân viên quản lý',   'debit',  '642', 2),
  ('6422', 'Chi phí vật liệu quản lý',    'debit',  '642', 2),
  ('911',  'Xác định kết quả kinh doanh', 'both',   null,  1)
on conflict (code) do nothing;

-- ── Hai kỳ liền nhau, không chồng lấn ─────────────────────────────────────
insert into finance.periods (code, start_date, end_date, status, closed_at, closed_by) values
  ('2025-12', '2025-12-01', '2025-12-31', 'closed', '2026-01-05 09:00+07', 'ci'),
  ('2026-01', '2026-01-01', '2026-01-31', 'open',   null,                  null)
on conflict (code) do nothing;

insert into finance.partners (code, name, kind) values
  ('KH-CI', 'Khách hàng thử',   'customer'),
  ('NC-CI', 'Nhà cung cấp thử', 'supplier')
on conflict (code) do nothing;

-- ── Số dư đầu kỳ, cân ─────────────────────────────────────────────────────
insert into finance.opening_balances (account_code, period_code, debit, credit) values
  ('111', '2026-01', 500000000, 0),
  ('131', '2026-01', 120000000, 0),
  ('331', '2026-01', 0,         620000000)
on conflict (account_code, period_code) do nothing;

-- ── Chứng từ ──────────────────────────────────────────────────────────────
do $$
declare
  v1 uuid; v2 uuid; v3 uuid; v4 uuid;
begin
  -- 1 · Chứng từ ghi TRƯỚC khi kỳ 2025-12 bị khóa. Hợp lệ: bất biến 9 chỉ bắt
  --     chứng từ tạo SAU thời điểm khóa, không bắt chứng từ có sẵn.
  insert into finance.vouchers (voucher_no, posting_date, period_code, description, created_at)
    values ('CI-2512-01', '2025-12-20', '2025-12', 'Bán hàng tháng 12', '2025-12-20 10:00+07')
    returning id into v1;
  insert into finance.journal_lines
    (voucher_id, line_no, account_code, contra_account_code, debit, credit) values
    (v1, 1, '111', '511', 88000000, 0),
    (v1, 2, '511', '111', 0,        88000000);

  -- 2 · Một Nợ nhiều Có. Cân ở mức chứng từ chứ không cân theo từng cặp dòng.
  insert into finance.vouchers (voucher_no, posting_date, period_code, description)
    values ('CI-2601-01', '2026-01-08', '2026-01', 'Mua vật tư, trả một phần')
    returning id into v2;
  insert into finance.journal_lines
    (voucher_id, line_no, account_code, contra_account_code, debit, credit, partner_code) values
    (v2, 1, '6422', '111', 30000000, 0,        'NC-CI'),
    (v2, 2, '111',  '6422', 0,        12000000, 'NC-CI'),
    (v2, 3, '331',  '6422', 0,        18000000, 'NC-CI');

  -- 3 · Bút toán đỏ. Hủy một phần chứng từ trên bằng cách ghi âm cả hai vế.
  --     Ràng buộc sau migration 025 cho phép số âm nhưng vẫn cấm ghi cả hai vế
  --     trên cùng một dòng. Đây là cách kế toán Việt Nam hủy bút toán đã ghi
  --     mà vẫn giữ nguyên dấu vết, thay vì xóa dòng đi.
  insert into finance.vouchers (voucher_no, posting_date, period_code, description)
    values ('CI-2601-02', '2026-01-09', '2026-01', 'Bút toán đỏ điều chỉnh CI-2601-01')
    returning id into v3;
  insert into finance.journal_lines
    (voucher_id, line_no, account_code, contra_account_code, debit, credit, partner_code) values
    (v3, 1, '6422', '331', -5000000, 0,         'NC-CI'),
    (v3, 2, '331',  '6422', 0,        -5000000, 'NC-CI');

  -- 4 · Kết chuyển cuối kỳ về 911, đúng cách sổ thật đóng kỳ.
  insert into finance.vouchers (voucher_no, posting_date, period_code, description)
    values ('CI-2601-03', '2026-01-31', '2026-01', 'Kết chuyển chi phí về 911')
    returning id into v4;
  insert into finance.journal_lines
    (voucher_id, line_no, account_code, contra_account_code, debit, credit) values
    (v4, 1, '911',  '6422', 25000000, 0),
    (v4, 2, '6422', '911',  0,        25000000);
end $$;

\echo 'Đã nạp dữ liệu mẫu: 9 tài khoản · 2 kỳ · 4 chứng từ · 9 dòng bút toán'
