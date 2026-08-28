-- Bất biến kế toán phải còn nguyên sau khi áp toàn bộ migration.
--
-- Dữ liệu chuẩn bị nằm NGOÀI khối exception. Khối exception trong plpgsql
-- hoàn tác mọi thứ xảy ra bên trong nó, kể cả những dòng chèn để chuẩn bị,
-- nên đặt chúng bên trong là tự làm mất dữ liệu cho các phép thử sau.

\set ON_ERROR_STOP on

insert into finance.accounts(code, name, nature, depth)
  values ('999', 'Tài khoản thử', 'both', 1);
insert into finance.periods(code, start_date, end_date)
  values ('2000-01', '2000-01-01', '2000-01-31');
insert into finance.vouchers(voucher_no, posting_date, period_code)
  values ('THU001', '2000-01-15', '2000-01');
insert into finance.users(username, password_hash, full_name, role)
  values ('thu', 'scrypt$x$y', 'Người thử', 'accountant');
insert into finance.access_log(actor, action) values ('ci', 'thu');

-- 1 · Một dòng bút toán không được ghi cả hai vế
do $$
begin
  begin
    insert into finance.journal_lines(voucher_id, line_no, account_code, debit, credit)
      select id, 1, '999', 100, 100 from finance.vouchers where voucher_no = 'THU001';
    raise exception 'HONG: ghi duoc ca hai ve tren mot dong';
  exception when check_violation then
    raise notice 'OK · chan duoc dong ghi ca hai ve';
  end;
end $$;

-- 2 · Bút toán đỏ ghi số âm PHẢI được chấp nhận
do $$
begin
  insert into finance.journal_lines(voucher_id, line_no, account_code, debit, credit)
    select id, 1, '999', -1571, 0 from finance.vouchers where voucher_no = 'THU001';
  raise notice 'OK · nhan duoc but toan do ghi so am';
end $$;

-- 3 · Nhật ký truy cập chỉ thêm, không sửa không xóa
do $$
begin
  begin
    update finance.access_log set actor = 'gia_mao';
    raise exception 'HONG: sua duoc nhat ky truy cap';
  exception when insufficient_privilege then
    raise notice 'OK · chan duoc sua nhat ky truy cap';
  end;
end $$;

do $$
begin
  begin
    delete from finance.access_log;
    raise exception 'HONG: xoa duoc nhat ky truy cap';
  exception when insufficient_privilege then
    raise notice 'OK · chan duoc xoa nhat ky truy cap';
  end;
end $$;

-- 4 · Người dùng không tự đổi vai trò hay trạng thái của chính mình
do $$
declare v_id text;
begin
  select id::text into v_id from finance.users where username = 'thu';
  perform set_config('finance.self_edit', v_id, false);
  begin
    update finance.users set role = 'vault_admin' where username = 'thu';
    raise exception 'HONG: tu nang quyen duoc';
  exception when insufficient_privilege then
    raise notice 'OK · chan duoc tu nang quyen';
  end;
  begin
    update finance.users set is_active = false where username = 'thu';
    raise exception 'HONG: tu vo hieu hoa duoc';
  exception when insufficient_privilege then
    raise notice 'OK · chan duoc tu vo hieu hoa';
  end;
  -- Sửa hồ sơ của chính mình thì phải được
  update finance.users set phone = '0900000000' where username = 'thu';
  raise notice 'OK · tu sua ho so duoc';
  perform set_config('finance.self_edit', '', false);
end $$;

-- 5 · Kỳ đã khóa thì không ghi được chứng từ vào
update finance.periods set status = 'locked' where code = '2000-01';
do $$
begin
  begin
    insert into finance.vouchers(voucher_no, posting_date, period_code)
      values ('THU002', '2000-01-16', '2000-01');
    raise exception 'HONG: ghi duoc vao ky da khoa';
  exception when insufficient_privilege then
    raise notice 'OK · chan duoc ghi vao ky da khoa';
  end;
end $$;

-- 6 · Các view báo cáo phải truy vấn được, không lỗi cột
select count(*) from finance.v_trial_balance;
select count(*) from finance.v_period_balance;
select count(*) from finance.v_unbalanced;
select count(*) from finance.v_nondeductible;
select count(*) from finance.v_so_du_theo_tai_khoan;
select count(*) from finance.v_chi_phi_theo_khoan_muc;
select count(*) from finance.v_khoan_muc_gan_thieu;
select count(*) from finance_src.employees;
select count(*) from finance_src.attendance;
select count(*) from finance_src.leads;
select count(*) from finance_src.pg_attendance;
select count(*) from app.v_suc_khoe_sao_luu;
select count(*) from app.v_sao_luu_da_chet;
\echo 'OK · 13 view deu truy van duoc'
