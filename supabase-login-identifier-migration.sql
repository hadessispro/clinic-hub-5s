-- Allow one Supabase Auth account to be addressed by either employee number or real email.
create or replace function public.resolve_login_email(p_branch_id text, p_identifier text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from public.employees e
  join public.profiles p on p.employee_code = e.code and p.active = true
  join auth.users u on u.id = p.id
  where e.status = 'active'
    and e.branch_id = p_branch_id
    and lower(trim(p_identifier)) in (
      lower(coalesce(e.employee_number, '')),
      lower(e.code),
      lower(coalesce(e.email, '')),
      lower(u.email)
    )
  limit 1;
$$;

revoke all on function public.resolve_login_email(text, text) from public;
grant execute on function public.resolve_login_email(text, text) to anon, authenticated;

-- Restore the real LVT emails collected from the employee form.
update public.employees set email = case employee_number
  when '10241' then 'vannguyen10a3@gmail.com'
  when '10242' then 'tn01638827382@gmail.com'
  when '10216' then 'nguyenthinhuhuynh2909@gmail.com'
  when '10225' then 'hauvothi3@gmail.com'
  when '10255' then 'trucnguyen12121995@gmail.com'
  when '10256' then 'lekhathyc14@gmail.com'
  when '10245' then 'tranxuannhan1705@gmail.com'
  when '10244' then 'thienthay123@gmail.com'
  when '10232' then 'quynhquyenkg2018@gmail.com'
  when '10240' then 'khangnlcltv@gmail.com'
  when '10247' then 'myphung190605@gmail.com'
  else email end
where branch_id = 'le-van-tho' or employee_number = '10240';

-- Võ Đăng Khang belongs to Lê Văn Thọ, not Phạm Văn Chiêu.
update public.employees
set branch_id = 'le-van-tho', email = 'khangnlcltv@gmail.com', phone = '0392095618'
where employee_number = '10240';

update public.profiles p
set branch_id = 'le-van-tho'
from public.employees e
where p.employee_code = e.code and e.employee_number = '10240';

update auth.users u
set email = 'lvt.10240@login.nhakhoa5s.vn',
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('branch_id','le-van-tho','employee_number','10240')
from public.profiles p
join public.employees e on e.code = p.employee_code
where u.id = p.id and e.employee_number = '10240';

update auth.identities i
set identity_data = coalesce(identity_data, '{}'::jsonb)
      || jsonb_build_object('email','lvt.10240@login.nhakhoa5s.vn')
from public.profiles p
join public.employees e on e.code = p.employee_code
where i.user_id = p.id and e.employee_number = '10240' and i.provider = 'email';
