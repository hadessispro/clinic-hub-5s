import { supabase } from '../supabase.js';

async function pilotRequest(path = '', options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn.');
  const response = await fetch(`/api/pilot-schedule${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể tải lịch thử nghiệm.');
  return result;
}

export function getPilotSchedule({ month, branch, department }) {
  if (supabase.isLocal) return getLocalPilotSchedule({ month, branch, department });
  const query = new URLSearchParams({ month, branch, department });
  return pilotRequest(`?${query}`);
}

export async function savePilotScheduleChanges(changes) {
  if (supabase.isLocal) {
    let saved = 0; let removed = 0;
    for (const item of changes || []) {
      const { data: existing, error: findError } = await supabase.from('schedule_assignments').select('*')
        .eq('employee_code', item.employee).eq('work_date', item.date).maybeSingle();
      if (findError) throw findError;
      if (!item.shift) {
        if (existing) {
          const { error } = await supabase.from('schedule_assignments').delete().eq('id', existing.id);
          if (error) throw error;
          removed += 1;
        }
      } else if (existing) {
        const { error } = await supabase.from('schedule_assignments').update({ shift_code: item.shift, status: 'planned',
          note: '[PILOT_ADMIN_IT] Lịch thử nghiệm trên VPS' }).eq('id', existing.id);
        if (error) throw error;
        saved += 1;
      } else {
        const { error } = await supabase.from('schedule_assignments').insert({ employee_code: item.employee,
          work_date: item.date, shift_code: item.shift, status: 'planned', overtime_minutes: 0,
          early_arrival_minutes: 0, early_leave_minutes: 0, note: '[PILOT_ADMIN_IT] Lịch thử nghiệm trên VPS' });
        if (error) throw error;
        saved += 1;
      }
    }
    return { saved, removed };
  }
  return pilotRequest('', { method: 'POST', body: JSON.stringify({ changes }) });
}

async function getLocalPilotSchedule({ month, branch, department }) {
  const [employeeResult, shiftResult, allowedResult, assignmentResult] = await Promise.all([
    supabase.from('employees').select('*').eq('status', 'active').eq('branch_id', branch).eq('department', department).order('full_name'),
    supabase.from('work_shifts').select('*').eq('active', true).order('start_time'),
    supabase.from('employee_allowed_shifts').select('*'),
    supabase.from('schedule_assignments').select('*').gte('work_date', `${month}-01`).lte('work_date', `${month}-31`),
  ]);
  for (const result of [employeeResult, shiftResult, allowedResult, assignmentResult]) if (result.error) throw result.error;
  const employees = employeeResult.data || [];
  const codes = new Set(employees.map((item) => item.code));
  return { month, branch, department, employees, shifts: shiftResult.data || [],
    allowed: (allowedResult.data || []).filter((item) => codes.has(item.employee_code)),
    assignments: (assignmentResult.data || []).filter((item) => codes.has(item.employee_code)) };
}
