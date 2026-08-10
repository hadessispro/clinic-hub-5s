-- Keep the Admin IT fallback shift consistent with the selectable shift list.
insert into public.employee_allowed_shifts (employee_code, shift_code)
values ('PVC-IT', 'clinic-0800')
on conflict (employee_code, shift_code) do nothing;

