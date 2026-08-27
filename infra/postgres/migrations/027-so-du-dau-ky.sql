-- ═══════════════════════════════════════════════════════════════════════════
-- SỐ DƯ ĐẦU KỲ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Nhật ký chung là sổ gốc: mọi báo cáo phát sinh đều dựng lại được từ nó, và
-- vì cùng một nguồn nên chúng không thể mâu thuẫn nhau. Đó là lý do hệ thống
-- này không nhập riêng từng file báo cáo.
--
-- Nhưng nhật ký chung có đúng một thứ nó không chứa: SỐ DƯ ĐẦU KỲ. Sổ nhật ký
-- ghi những gì xảy ra trong năm, không ghi những gì đã có từ trước. Thiếu nó
-- thì Sổ quỹ tiền mặt bắt đầu từ 0 thay vì 1.798.590.807, Sổ chi tiết công nợ
-- không có dòng "Số dư đầu kỳ", và Bảng cân đối kế toán B01 không lập được.
--
-- Số dư đầu kỳ lấy từ Bảng cân đối tài khoản: mỗi tài khoản một dòng, hai con
-- số. Đây là nguồn thứ hai duy nhất được phép, và nó không chồng lấn với nhật
-- ký nên không tạo ra mâu thuẫn.
--
-- An toàn khi chạy lại nhiều lần.

begin;

create table if not exists finance.opening_balances (
  account_code  text not null references finance.accounts(code) on delete cascade,
  period_code   text not null,
  debit         numeric(18, 2) not null default 0,
  credit        numeric(18, 2) not null default 0,
  source_file   text,
  batch_id      uuid references finance.import_batches(id) on delete set null,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (account_code, period_code)
);

comment on table finance.opening_balances is
  'Số dư đầu kỳ, nguồn duy nhất là Bảng cân đối tài khoản. Nhật ký chung '
  'không chứa thông tin này.';
comment on column finance.opening_balances.period_code is
  'Kỳ mà số dư này là số ĐẦU kỳ. Thường chỉ có kỳ đầu năm.';

create index if not exists opening_balances_ky_idx
  on finance.opening_balances(period_code);


-- ───────────────────────────────────────────────────────────────────────────
-- SỔ CHI TIẾT TÀI KHOẢN CÓ SỐ DƯ LŨY KẾ THẬT
-- ───────────────────────────────────────────────────────────────────────────
-- View cũ tính lũy kế từ 0. Với tài khoản tiền mặt thì con số đó vô nghĩa:
-- quỹ không bao giờ bắt đầu năm với 0 đồng.

create or replace view finance.v_so_du_theo_tai_khoan as
select a.code as account_code,
       a.name as account_name,
       a.nature,
       coalesce(o.debit, 0)  as dau_ky_no,
       coalesce(o.credit, 0) as dau_ky_co,
       coalesce(t.ps_no, 0)  as ps_no,
       coalesce(t.ps_co, 0)  as ps_co,
       -- Số dư cuối kỳ theo tính chất tài khoản. Tài khoản dư Nợ thì dư âm
       -- không có nghĩa, nhưng vẫn giữ nguyên dấu thay vì ép về 0: dư âm là
       -- dấu hiệu có gì đó sai, che đi là che mất chính cái cần thấy.
       coalesce(o.debit, 0) - coalesce(o.credit, 0)
         + coalesce(t.ps_no, 0) - coalesce(t.ps_co, 0) as cuoi_ky
from finance.accounts a
left join finance.opening_balances o on o.account_code = a.code
left join (
  select l.account_code, sum(l.debit) as ps_no, sum(l.credit) as ps_co
  from finance.journal_lines l group by 1
) t on t.account_code = a.code;

comment on view finance.v_so_du_theo_tai_khoan is
  'Đầu kỳ từ Bảng cân đối, phát sinh từ Nhật ký chung, cuối kỳ tính ra. '
  'Đây là nền của mọi báo cáo có cột số dư.';

grant select on finance.v_so_du_theo_tai_khoan to finance_app;
grant select, insert, update, delete on finance.opening_balances to finance_app;

commit;
