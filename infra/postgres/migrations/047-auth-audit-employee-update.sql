-- Cho phép ghi nhận thao tác cập nhật thông tin nhân viên và đổi mã nhân sự trong nhật ký tài khoản.
alter table app.auth_audit drop constraint if exists auth_audit_hanh_dong_check;

alter table app.auth_audit add constraint auth_audit_hanh_dong_check
  check (hanh_dong in (
    'dang_nhap_dung', 'dang_nhap_sai', 'khoa_tam', 'mo_khoa',
    'doi_vai_tro', 'khoa_tai_khoan', 'dat_lai_mat_khau', 'tao_tai_khoan',
    'cap_nhat_ho_so', 'cap_nhat_nhan_vien', 'doi_ma_nhan_vien', 'truy_van_du_lieu'
  ));
