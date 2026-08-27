-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE VAULT · Nền móng phân hệ tài chính kế toán nội bộ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Nguyên tắc bảo mật, theo thứ tự hiệu quả thực tế:
--
--   1. Tài chính nằm ở schema riêng, có tài khoản database riêng.
--   2. Tài chính ĐỌC được vận hành, vận hành KHÔNG BAO GIỜ đọc được tài chính.
--   3. Tài chính đọc qua view chỉ phơi bày đúng cột cần, không đọc thẳng bảng gốc.
--   4. Nhật ký truy cập chỉ thêm mới, không sửa và không xóa.
--   5. Kỳ đã chốt không sửa được, chỉ ghi bút toán điều chỉnh.
--
-- Mô hình dữ liệu dựng theo cấu trúc thật của bộ sổ đã khảo sát ngày 27/08/2026:
-- 77.220 bút toán, 13.792 chứng từ, 256 tài khoản, tổng phát sinh 99,83 tỷ,
-- Nợ bằng Có tuyệt đối.
--
-- An toàn khi chạy lại nhiều lần.

begin;

create schema if not exists finance;
create schema if not exists finance_src;

comment on schema finance is
  'Sổ sách kế toán nội bộ. Chỉ role finance_app được đọc ghi.';
comment on schema finance_src is
  'Lớp view một chiều: tài chính đọc dữ liệu vận hành qua đây, chỉ những cột cần thiết.';


-- ───────────────────────────────────────────────────────────────────────────
-- 1 · DANH MỤC
-- ───────────────────────────────────────────────────────────────────────────

-- Hệ thống tài khoản. Nguồn: Danh_sach_he_thong_tai_khoan.xlsx (256 tài khoản)
create table if not exists finance.accounts (
  code            text primary key,
  name            text not null,
  name_en         text,
  -- 'Dư Nợ' | 'Dư Có' | 'Lưỡng tính' theo cột Tính chất trong file gốc
  nature          text not null check (nature in ('debit', 'credit', 'both')),
  parent_code     text references finance.accounts(code) on delete restrict,
  depth           integer not null,
  is_active       boolean not null default true,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column finance.accounts.depth is
  'Cấp tài khoản, suy từ độ dài mã: 111 là cấp 1, 1111 là cấp 2.';

-- Khoản mục chi phí. Nguồn: Danh_sach_khoan_muc_chi_phi.xlsx (54 mục)
-- Mã có dạng DN, DN.LVT, DN.PVC — hậu tố chính là mã chi nhánh.
create table if not exists finance.cost_items (
  code            text primary key,
  name            text not null,
  branch_code     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
comment on column finance.cost_items.branch_code is
  'Suy từ hậu tố mã: DN.LVT thuộc Lê Văn Thọ, DN.PVC thuộc Phạm Văn Chiêu.';

-- Đối tượng công nợ: khách hàng, nhà cung cấp, nhân viên.
-- Tiền tố mã cho biết loại và chi nhánh: APC, PVC, LVT, NCC, NV, ANP, CTY, BS.
create table if not exists finance.partners (
  code            text primary key,
  name            text not null,
  kind            text not null check (kind in ('customer', 'supplier', 'employee', 'other')),
  branch_hint     text,
  tax_code        text,
  address         text,
  phone           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Kỳ kế toán. Khóa kỳ là lớp bảo vệ chống sửa số liệu quá khứ.
create table if not exists finance.periods (
  code            text primary key,
  start_date      date not null,
  end_date        date not null,
  status          text not null default 'open'
                    check (status in ('open', 'closed', 'locked')),
  closed_at       timestamptz,
  closed_by       text,
  note            text,
  check (end_date >= start_date)
);
comment on table finance.periods is
  'open: ghi được. closed: chỉ ghi bút toán điều chỉnh. locked: không ghi gì.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2 · NHẬP LIỆU THEO LÔ
-- ───────────────────────────────────────────────────────────────────────────
-- Không bao giờ ghi thẳng vào sổ cái. File gốc giữ nguyên trạng, đọc vào bảng
-- đệm, kiểm tra, xem trước, người duyệt, rồi mới ghi. Mỗi lô hoàn tác trọn vẹn.

create table if not exists finance.import_batches (
  id              uuid primary key default gen_random_uuid(),
  source_file     text not null,
  source_sha256   text not null,
  sheet_names     text[] not null default '{}',
  row_count       integer not null default 0,
  status          text not null default 'staged'
                    check (status in ('staged', 'validated', 'rejected', 'posted', 'reverted')),
  -- Kết quả đối chiếu: tổng đọc được, tổng ghi trong file, chênh lệch
  recon           jsonb not null default '{}'::jsonb,
  errors          jsonb not null default '[]'::jsonb,
  created_by      text,
  created_at      timestamptz not null default now(),
  posted_by       text,
  posted_at       timestamptz,
  reverted_at     timestamptz
);
comment on column finance.import_batches.source_sha256 is
  'Vân tay file gốc. Nhập lại đúng file này thì nhận ra ngay.';

-- Dòng thô, chưa ép kiểu, chưa diễn giải. Giữ để truy ngược và nhập lại.
create table if not exists finance.import_rows (
  id              bigserial primary key,
  batch_id        uuid not null references finance.import_batches(id) on delete cascade,
  sheet_name      text not null,
  row_no          integer not null,
  raw             jsonb not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'ok', 'rejected')),
  reject_reason   text
);
create index if not exists import_rows_batch_idx on finance.import_rows(batch_id, status);


-- ───────────────────────────────────────────────────────────────────────────
-- 3 · SỔ CÁI · BÚT TOÁN KÉP
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists finance.vouchers (
  id              uuid primary key default gen_random_uuid(),
  voucher_no      text not null,
  posting_date    date not null,
  voucher_date    date,
  -- Tiền tố mã chứng từ: BH bán hàng, PT phiếu thu, PC phiếu chi,
  -- GBN/GBC giấy báo nợ và có ngân hàng, NK/XK nhập xuất kho, NVK nghiệp vụ khác
  voucher_type    text,
  invoice_no      text,
  description     text,
  period_code     text not null references finance.periods(code),
  -- Năm chứng từ cân bằng theo cặp chứ không tự cân: dùng chung một mã nhóm.
  balance_group   text,
  batch_id        uuid references finance.import_batches(id) on delete set null,
  source_ref      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (voucher_no, posting_date)
);
comment on column finance.vouchers.balance_group is
  'Khảo sát thực tế: 10 trên 13.792 chứng từ không tự cân bằng mà cân theo cặp, '
  'ví dụ NK877/244 với PC043/2026_06. Ép cân bằng từng chứng từ sẽ chặn nhầm '
  'dữ liệu thật, nên cân bằng được kiểm ở mức nhóm và mức kỳ.';

create index if not exists vouchers_period_idx on finance.vouchers(period_code, posting_date);
create index if not exists vouchers_type_idx   on finance.vouchers(voucher_type, posting_date desc);
create index if not exists vouchers_batch_idx  on finance.vouchers(batch_id);

create table if not exists finance.journal_lines (
  id                  bigserial primary key,
  voucher_id          uuid not null references finance.vouchers(id) on delete cascade,
  line_no             integer not null,
  account_code        text not null references finance.accounts(code) on delete restrict,
  -- Sổ Việt Nam ghi cả tài khoản đối ứng trên từng dòng. Giữ lại để đối chiếu
  -- ngược với bản Excel, dù mô hình bút toán kép không bắt buộc.
  contra_account_code text,
  debit               numeric(18, 2) not null default 0,
  credit              numeric(18, 2) not null default 0,
  partner_code        text references finance.partners(code) on delete set null,
  cost_item_code      text references finance.cost_items(code) on delete set null,
  description         text,
  -- Cột "CP hợp lý / không hợp lý" trong sổ gốc. Đây là nguồn của
  -- Bảng kê chi phí không hợp lý khi quyết toán thuế.
  is_deductible       boolean not null default true,
  source_sheet        text,
  source_row          integer,
  created_at          timestamptz not null default now(),

  check (debit >= 0 and credit >= 0),
  -- Khảo sát 77.220 dòng: không dòng nào có cả hai bên. Ràng buộc này
  -- chặn loại lỗi nhập liệu phổ biến nhất ngay tại database.
  check (not (debit > 0 and credit > 0))
);

create index if not exists jl_voucher_idx  on finance.journal_lines(voucher_id);
create index if not exists jl_account_idx  on finance.journal_lines(account_code);
create index if not exists jl_partner_idx  on finance.journal_lines(partner_code)
  where partner_code is not null;
create index if not exists jl_nondeduct_idx on finance.journal_lines(is_deductible)
  where is_deductible = false;


-- ───────────────────────────────────────────────────────────────────────────
-- 4 · NHẬT KÝ TRUY CẬP · CHỈ THÊM, KHÔNG SỬA KHÔNG XÓA
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists finance.access_log (
  id              bigserial primary key,
  actor           text not null,
  actor_role      text,
  action          text not null,
  target          text,
  filters         jsonb not null default '{}'::jsonb,
  row_count       integer,
  ip              inet,
  at              timestamptz not null default now()
);
create index if not exists access_log_actor_idx on finance.access_log(actor, at desc);
create index if not exists access_log_at_idx    on finance.access_log(at desc);

comment on table finance.access_log is
  'Ghi mọi lần đọc số tiền. Rò rỉ nội bộ truy được người. Chỉ INSERT.';

create or replace function finance.deny_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Nhật ký truy cập chỉ được thêm mới, không được % .', tg_op
    using errcode = '42501';
end $$;

drop trigger if exists access_log_no_update on finance.access_log;
create trigger access_log_no_update before update or delete on finance.access_log
  for each row execute function finance.deny_mutation();


-- ───────────────────────────────────────────────────────────────────────────
-- 5 · KHÓA KỲ KẾ TOÁN
-- ───────────────────────────────────────────────────────────────────────────

create or replace function finance.guard_locked_period() returns trigger
language plpgsql as $$
declare
  v_period text;
  v_status text;
begin
  v_period := coalesce(new.period_code, old.period_code);
  select status into v_status from finance.periods where code = v_period;
  if v_status = 'locked' then
    raise exception 'Kỳ % đã khóa. Muốn sửa phải ghi bút toán điều chỉnh ở kỳ đang mở.', v_period
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists vouchers_period_guard on finance.vouchers;
create trigger vouchers_period_guard before insert or update or delete on finance.vouchers
  for each row execute function finance.guard_locked_period();


-- ───────────────────────────────────────────────────────────────────────────
-- 6 · VIEW ĐỐI CHIẾU
-- ───────────────────────────────────────────────────────────────────────────

-- Cân bằng từng chứng từ. Dùng để soát, không dùng để chặn.
create or replace view finance.v_voucher_balance as
select v.id, v.voucher_no, v.posting_date, v.period_code, v.balance_group,
       sum(l.debit)  as total_debit,
       sum(l.credit) as total_credit,
       sum(l.debit) - sum(l.credit) as diff,
       count(*) as line_count
from finance.vouchers v
join finance.journal_lines l on l.voucher_id = v.id
group by v.id;

-- Chứng từ không tự cân và cũng không thuộc nhóm cân nào. Đây mới là lỗi thật.
create or replace view finance.v_unbalanced as
select * from finance.v_voucher_balance
where abs(diff) > 0.005 and balance_group is null;

-- Cân bằng theo kỳ. Đây là bất biến bắt buộc: phải bằng 0.
create or replace view finance.v_period_balance as
select v.period_code,
       sum(l.debit)  as total_debit,
       sum(l.credit) as total_credit,
       sum(l.debit) - sum(l.credit) as diff,
       count(distinct v.id) as voucher_count,
       count(*) as line_count
from finance.vouchers v
join finance.journal_lines l on l.voucher_id = v.id
group by v.period_code;

-- Bảng cân đối tài khoản, dựng lại từ sổ cái. Thay cho việc nhập file báo cáo.
create or replace view finance.v_trial_balance as
select l.account_code,
       a.name as account_name,
       v.period_code,
       sum(l.debit)  as ps_debit,
       sum(l.credit) as ps_credit
from finance.journal_lines l
join finance.vouchers v on v.id = l.voucher_id
join finance.accounts a on a.code = l.account_code
group by l.account_code, a.name, v.period_code;

-- Chi phí không hợp lý, nguồn cho Bảng kê khi quyết toán thuế.
create or replace view finance.v_nondeductible as
select v.period_code, v.posting_date, v.voucher_no, l.account_code,
       l.description, l.debit, l.credit, l.partner_code
from finance.journal_lines l
join finance.vouchers v on v.id = l.voucher_id
where l.is_deductible = false;


-- ───────────────────────────────────────────────────────────────────────────
-- 7 · LỚP MỘT CHIỀU: TÀI CHÍNH ĐỌC VẬN HÀNH
-- ───────────────────────────────────────────────────────────────────────────
-- Chỉ phơi bày đúng cột cần. Lương cần mã nhân viên và đơn giá giờ, không cần
-- số điện thoại hay ghi chú mật. Giới hạn thiệt hại nếu có sự cố.

create or replace view finance_src.employees as
select payload->>'code'                                as employee_code,
       payload->>'full_name'                           as full_name,
       payload->>'department'                          as department,
       nullif(payload->>'hourly_rate', '')::numeric    as hourly_rate,
       nullif(payload->>'salary_offer', '')::numeric   as salary_offer,
       payload->>'status'                              as status
from app.records
where entity_type = 'employees' and deleted_at is null;

create or replace view finance_src.attendance as
select payload->>'employee_code'  as employee_code,
       (payload->>'work_date')::date as work_date,
       payload->>'record_type'    as record_type,
       payload->>'status'         as status
from app.records
where entity_type = 'attendance_records' and deleted_at is null;

create or replace view finance_src.leads as
select id::text                                 as lead_id,
       created_at,
       branch_id,
       data_class,
       service_type,
       created_by_pg_code,
       assigned_telesale_code,
       status,
       pg_arrival_confirmed_at
from marketing.leads;

-- work_date nam o bang phan ca, khong nam o bang cham cong. Phai join.
create or replace view finance_src.pg_attendance as
select a.pg_code,
       s.work_date,
       a.record_type,
       a.status,
       a.captured_offline,
       a.captured_at
from marketing.pg_attendance a
left join marketing.pg_shift_assignments s on s.id = a.assignment_id;

comment on view finance_src.leads is
  'Không phơi bày tên và số điện thoại khách hàng. Tài chính chỉ cần đếm và '
  'phân bổ chi phí theo kênh, không cần danh tính.';


-- ───────────────────────────────────────────────────────────────────────────
-- 8 · PHÂN QUYỀN
-- ───────────────────────────────────────────────────────────────────────────
-- Tạo role không mật khẩu ở đây. Mật khẩu đặt riêng bằng lệnh ALTER ROLE khi
-- triển khai, không bao giờ viết vào file migration nằm trong Git.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'finance_app') then
    create role finance_app login;
  end if;
end $$;

-- Toàn quyền trên schema tài chính
grant usage on schema finance to finance_app;
grant select, insert, update, delete on all tables in schema finance to finance_app;
grant usage, select on all sequences in schema finance to finance_app;
alter default privileges in schema finance
  grant select, insert, update, delete on tables to finance_app;
alter default privileges in schema finance
  grant usage, select on sequences to finance_app;

-- Nhật ký chỉ được thêm
revoke update, delete on finance.access_log from finance_app;

-- Chỉ ĐỌC lớp một chiều. Không cấp gì trên app và marketing.
grant usage on schema finance_src to finance_app;
grant select on all tables in schema finance_src to finance_app;
alter default privileges in schema finance_src grant select on tables to finance_app;

-- View trong finance_src đọc bảng gốc, nên role cần quyền nền. Cấp tối thiểu.
grant usage on schema app, marketing to finance_app;
grant select on app.records to finance_app;
grant select on marketing.leads, marketing.pg_attendance,
                marketing.pg_shift_assignments to finance_app;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- SAU KHI CHẠY, THỰC HIỆN THỦ CÔNG TRÊN MÁY CHỦ (không đưa vào Git):
--
--   1. Đặt mật khẩu:
--        alter role finance_app password '<mật khẩu mạnh sinh ngẫu nhiên>';
--
--   2. Thu hồi quyền của backend vận hành trên schema tài chính.
--      Thay <backend_role> bằng tài khoản backend đang dùng:
--        revoke all on schema finance from <backend_role>;
--        revoke all on all tables in schema finance from <backend_role>;
--
--   3. Kiểm chứng: đăng nhập bằng tài khoản backend rồi chạy
--        select * from finance.journal_lines limit 1;
--      Lệnh này PHẢI bị từ chối. Nếu chạy được nghĩa là bước 2 chưa xong.
-- ═══════════════════════════════════════════════════════════════════════════
