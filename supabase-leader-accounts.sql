-- Nâng quyền các tài khoản trưởng phòng/trưởng bộ phận đã được xác nhận.
begin;

update public.employees
set email = 'nguyenthinhuhuynh2909@gmail.com',
    title = 'Trưởng bộ phận Phụ tá',
    updated_at = now()
where code = 'PVC003';

update public.employees
set email = 'dr.thyhuynh2409@gmail.com',
    title = 'Trưởng phòng Bác sĩ',
    updated_at = now()
where code = 'PVC-10187';

update public.employees
set email = 'phanngocducthesecretbeauty@gmail.com',
    title = 'Trưởng phòng Marketing',
    updated_at = now()
where code = 'PVC-10162';

update public.employees
set email = 'letanpvc@gmail.com',
    title = 'Trưởng bộ phận Lễ tân - Tư vấn',
    updated_at = now()
where code = 'PVC-10196';

update public.profiles
set role = 'leader',
    updated_at = now()
where employee_code in ('PVC003', 'PVC-10187', 'PVC-10162', 'PVC-10196');

commit;
