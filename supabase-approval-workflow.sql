begin;

alter table public.leave_requests add column if not exists leader_reviewed_at timestamptz;
alter table public.leave_requests add column if not exists operations_reviewed_at timestamptz;
alter table public.leave_requests add column if not exists rejection_reason text;

create or replace function public.submit_leave_request(
  p_employee_code text,p_request_type text,p_from_date date,p_to_date date,p_reason text,
  p_amount numeric default 0,p_bank_account text default null,p_start_time time default null,
  p_end_time time default null,p_overtime_minutes integer default 0
)
returns public.leave_requests language plpgsql security definer set search_path=public as $$
declare v_row public.leave_requests; v_self text;
begin
  v_self:=public.current_employee_code();
  if not public.is_ops_role() and p_employee_code<>v_self then raise exception 'Không thể gửi đơn thay nhân viên khác.' using errcode='42501'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Vui lòng nhập lý do.' using errcode='22023'; end if;
  if p_request_type='Đơn tăng ca' and (p_start_time is null or p_end_time is null or p_overtime_minutes<=0) then raise exception 'Thời gian tăng ca không hợp lệ.' using errcode='22023'; end if;
  insert into public.leave_requests(employee_code,request_type,from_date,to_date,amount,bank_account,request_start_time,request_end_time,overtime_minutes,reason,status,leader_status,operations_status,routed_to)
  values(p_employee_code,p_request_type,p_from_date,coalesce(p_to_date,p_from_date),coalesce(p_amount,0),nullif(p_bank_account,''),p_start_time,p_end_time,coalesce(p_overtime_minutes,0),trim(p_reason),'pending','pending','pending',case when p_request_type in ('Tạm ứng lương','Ứng lương') then 'kt' else 'ns' end)
  returning * into v_row; return v_row;
end $$;

create or replace function public.review_leave_request(p_request_id uuid,p_decision text,p_reason text default null)
returns public.leave_requests language plpgsql security definer set search_path=public as $$
declare v_row public.leave_requests; v_role text:=public.current_clinic_role(); v_reviewer text:=public.current_employee_code();
begin
  if p_decision not in ('approved','rejected') then raise exception 'Quyết định không hợp lệ.' using errcode='22023'; end if;
  select * into v_row from public.leave_requests where id=p_request_id for update;
  if not found then raise exception 'Không tìm thấy đơn.' using errcode='P0002'; end if;
  if v_role='leader' then
    if v_row.leader_status<>'pending' then raise exception 'Đơn đã được trưởng bộ phận xử lý.' using errcode='22023'; end if;
    update public.leave_requests set leader_status=p_decision,reviewer_code=v_reviewer,leader_reviewed_at=now(),rejection_reason=case when p_decision='rejected' then nullif(trim(p_reason),'') end,status=case when p_decision='rejected' then 'rejected' else 'pending' end where id=p_request_id returning * into v_row;
  elsif v_role in ('admin','hr') then
    if v_row.leader_status<>'approved' and v_role<>'admin' then raise exception 'Đơn chưa được trưởng bộ phận duyệt.' using errcode='22023'; end if;
    update public.leave_requests set leader_status=case when v_role='admin' and leader_status='pending' then 'approved' else leader_status end,operations_status=p_decision,reviewer_code=v_reviewer,operations_reviewed_at=now(),rejection_reason=case when p_decision='rejected' then nullif(trim(p_reason),'') end,status=p_decision where id=p_request_id returning * into v_row;
  else raise exception 'Tài khoản không có quyền duyệt đơn.' using errcode='42501';
  end if;
  return v_row;
end $$;

revoke all on function public.submit_leave_request(text,text,date,date,text,numeric,text,time,time,integer) from public;
grant execute on function public.submit_leave_request(text,text,date,date,text,numeric,text,time,time,integer) to authenticated;
revoke all on function public.review_leave_request(uuid,text,text) from public;
grant execute on function public.review_leave_request(uuid,text,text) to authenticated;

commit;
