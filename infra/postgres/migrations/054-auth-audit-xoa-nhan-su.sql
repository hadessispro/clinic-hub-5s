-- Cho phép ghi nhận thao tác xóa nhân sự trong nhật ký kiểm toán tài khoản.
alter table app.auth_audit drop constraint if exists auth_audit_hanh_dong_check;

alter table app.auth_audit add constraint auth_audit_hanh_dong_check
  check (hanh_dong in (
    'dang_nhap_dung', 'dang_nhap_sai', 'khoa_tam', 'mo_khoa',
    'doi_vai_tro', 'khoa_tai_khoan', 'dat_lai_mat_khau', 'tao_tai_khoan',
    'cap_nhat_ho_so', 'cap_nhat_nhan_vien', 'doi_ma_nhan_vien', 'truy_van_du_lieu',
    'xoa_nhan_su'
  ));

-- Đồng bộ trạng thái inactive và profile_locked cho các nhân viên đã bị khóa tài khoản
update app.records e
set payload = jsonb_set(jsonb_set(e.payload, '{status}', '"inactive"'::jsonb), '{profile_locked}', 'true'::jsonb),
    updated_at = now()
from app.records p
where p.entity_type = 'profiles'
  and e.entity_type = 'employees'
  and lower(e.payload->>'code') = lower(p.payload->>'employee_code')
  and p.deleted_at is null
  and e.deleted_at is null
  and (p.payload->>'active')::boolean = false;

