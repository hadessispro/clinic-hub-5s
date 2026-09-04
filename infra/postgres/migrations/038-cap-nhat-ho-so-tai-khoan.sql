-- Cho phép ghi nhận thao tác sửa thông tin người dùng từ màn Admin IT.
-- Nhật ký chỉ lưu giá trị hồ sơ trước/sau; không chứa mật khẩu hoặc mã băm.
alter table app.auth_audit drop constraint if exists auth_audit_hanh_dong_check;

alter table app.auth_audit add constraint auth_audit_hanh_dong_check
  check (hanh_dong in (
    'dat_lai_mat_khau', 'mo_khoa', 'tao_tai_khoan', 'doi_vai_tro',
    'khoa_tai_khoan', 'mo_khoa_tu_dong', 'cap_nhat_ho_so'
  ));
