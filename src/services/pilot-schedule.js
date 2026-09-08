import { dataClient } from '../data-client.js';

export function getPilotSchedule({ month, branch, department }) {
  return getLocalPilotSchedule({ month, branch, department });
}

export async function savePilotScheduleChanges(changes) {
  let saved = 0; let removed = 0;
  for (const item of changes || []) {
    const { data: existing, error: findError } = await dataClient.from('schedule_assignments').select('*')
      .eq('employee_code', item.employee).eq('work_date', item.date).maybeSingle();
    if (findError) throw findError;
    if (!item.shift) {
      if (existing) {
        const { error } = await dataClient.from('schedule_assignments').delete().eq('id', existing.id);
        if (error) throw error;
        removed += 1;
      }
    } else if (existing) {
      const { error } = await dataClient.from('schedule_assignments').update({ shift_code: item.shift, status: 'planned',
        note: '[PILOT_ADMIN_IT] Lịch thử nghiệm trên VPS' }).eq('id', existing.id);
      if (error) throw error;
      saved += 1;
    } else {
      const { error } = await dataClient.from('schedule_assignments').insert({ employee_code: item.employee,
        work_date: item.date, shift_code: item.shift, status: 'planned', overtime_minutes: 0,
        early_arrival_minutes: 0, early_leave_minutes: 0, note: '[PILOT_ADMIN_IT] Lịch thử nghiệm trên VPS' });
      if (error) throw error;
      saved += 1;
    }
  }
  return { saved, removed };
}

async function getLocalPilotSchedule({ month, branch, department }) {
  const [employeeResult, shiftResult, allowedResult, assignmentResult] = await Promise.all([
    dataClient.from('employees').select('*').eq('status', 'active').eq('branch_id', branch).eq('department', department).order('full_name'),
    dataClient.from('work_shifts').select('*').eq('active', true).order('start_time'),
    dataClient.from('employee_allowed_shifts').select('*'),
    dataClient.from('schedule_assignments').select('*').gte('work_date', `${month}-01`).lte('work_date', `${month}-31`),
  ]);
  for (const result of [employeeResult, shiftResult, allowedResult, assignmentResult]) if (result.error) throw result.error;
  const employees = employeeResult.data || [];
  const codes = new Set(employees.map((item) => item.code));
  return { month, branch, department, employees, shifts: shiftResult.data || [],
    allowed: (allowedResult.data || []).filter((item) => codes.has(item.employee_code)),
    assignments: (assignmentResult.data || []).filter((item) => codes.has(item.employee_code)) };
}
