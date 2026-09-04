-- SQL Console cho Admin IT dùng một PostgreSQL role riêng, không đăng nhập
-- trực tiếp và không có bất kỳ quyền ghi nào. Backend chỉ SET ROLE trong một
-- transaction READ ONLY nên kiểm tra ở ứng dụng và kiểm tra ở database độc lập.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clinic_query_reader') then
    create role clinic_query_reader nologin noinherit;
  end if;
  execute format('grant clinic_query_reader to %I', current_user);
end $$;

grant usage on schema app, marketing, public to clinic_query_reader;
grant select on all tables in schema app, marketing, public to clinic_query_reader;

-- Thông tin xác thực, phiên đăng nhập, hàng đợi backup và bảng snapshot không
-- bao giờ được đọc từ giao diện dù người dùng biết tên bảng.
revoke all on table app.local_accounts, app.refresh_sessions, app.backup_outbox
  from clinic_query_reader;
revoke all on table marketing.customer_profiles_backup_20260820,
  marketing.leads_backup_20260820, marketing.lead_staging
  from clinic_query_reader;

alter table app.auth_audit drop constraint if exists auth_audit_hanh_dong_check;
alter table app.auth_audit add constraint auth_audit_hanh_dong_check
  check (hanh_dong in (
    'dang_nhap_dung','dang_nhap_sai','khoa_tam','mo_khoa',
    'doi_vai_tro','khoa_tai_khoan','dat_lai_mat_khau','tao_tai_khoan',
    'cap_nhat_ho_so','truy_van_du_lieu'
  ));
