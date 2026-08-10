-- Phạm vi quản lý theo chi nhánh và bộ phận.
-- Migration đã áp dụng trên production: align_department_leaders_across_branches

create table if not exists public.leader_scopes (
  leader_code text not null references public.employees(code) on update cascade on delete cascade,
  branch_id text not null,
  department text not null,
  created_at timestamptz not null default now(),
  primary key (leader_code, branch_id, department)
);

insert into public.leader_scopes(leader_code, branch_id, department) values
  ('PVC003', 'le-van-tho', 'phuta'),
  ('PVC003', 'pham-van-chieu', 'phuta'),
  ('PVC-10187', 'le-van-tho', 'bs'),
  ('PVC-10187', 'pham-van-chieu', 'bs'),
  ('PVC-10196', 'le-van-tho', 'dvkh'),
  ('PVC-10196', 'pham-van-chieu', 'dvkh'),
  ('PVC-10162', 'pham-van-chieu', 'marketing'),
  ('PVC-10239', 'pham-van-chieu', 'hcth'),
  ('PVC-10203', 'pham-van-chieu', 'marketing')
on conflict do nothing;

-- Every active department leader manages the same department at both clinics.
-- This keeps new leaders aligned automatically instead of relying on a hard-coded list.
insert into public.leader_scopes (leader_code, branch_id, department)
select
  p.employee_code,
  branches.branch_id,
  coalesce(nullif(p.department, ''), nullif(e.department, '')) as department
from public.profiles p
left join public.employees e on e.code = p.employee_code
cross join (values ('le-van-tho'), ('pham-van-chieu')) as branches(branch_id)
where p.role = 'leader'
  and p.active = true
  and p.employee_code is not null
  and coalesce(nullif(p.department, ''), nullif(e.department, '')) is not null
on conflict (leader_code, branch_id, department) do nothing;

-- Verification: every active leader should have two rows for their department.
select
  p.employee_code,
  p.full_name,
  coalesce(p.department, e.department) as department,
  count(ls.branch_id) as branch_scope_count,
  string_agg(ls.branch_id, ', ' order by ls.branch_id) as branches
from public.profiles p
left join public.employees e on e.code = p.employee_code
left join public.leader_scopes ls
  on ls.leader_code = p.employee_code
 and ls.department = coalesce(p.department, e.department)
where p.role = 'leader' and p.active = true
group by p.employee_code, p.full_name, coalesce(p.department, e.department)
order by p.full_name;

-- manager_code của nhân viên thật được cập nhật theo các phạm vi trên.
-- Tài khoản mẫu e-* không được dùng để thay thế trưởng bộ phận thật.
