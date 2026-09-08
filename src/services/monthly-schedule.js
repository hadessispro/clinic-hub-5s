import { supabase } from '../supabase.js';
import { idleSubscription } from './realtime-fallback.js';

async function scheduleRequest(path = '', options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn.');
  const response = await fetch(`/api/monthly-schedule${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể xử lý lịch làm việc.');
  return result;
}

function parseWorkflow(request) {
  let meta = {};
  try { meta = JSON.parse(request?.preference || '{}'); } catch { meta = {}; }
  const fallback = request?.status === 'approved' ? 'approved' : request?.status === 'rejected' ? 'returned' : 'draft';
  return { workflow: 'monthly_schedule_v1', stage: meta.stage || fallback, ...meta };
}

function isPublishedDoctorSchedule(request) {
  if (!request) return true;
  try {
    const meta = JSON.parse(request.preference || '{}');
    if (meta.workflow !== 'monthly_schedule_v1') return true;
    return parseWorkflow(request).stage === 'approved';
  } catch {
    return true;
  }
}

function localScheduleAccessMode(profile) {
  if (['admin', 'hr', 'admin_it', 'superadmin', 'admin_marketing', 'telesale_leader'].includes(profile?.role)) return 'manage_all';
  if (profile?.role === 'bac_si' || profile?.department === 'bs') return 'doctor_self';
  return 'doctor_roster';
}

async function localMonthlySchedule({ month, branch = 'all', department = 'all' }) {
  const [profileResult, employeeResult, shiftResult, allowedResult, assignmentResult, requestResult] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from('employees').select('*').eq('status', 'active').order('full_name'),
    supabase.from('work_shifts').select('*').eq('active', true).order('start_time'),
    supabase.from('employee_allowed_shifts').select('*'),
    supabase.from('schedule_assignments').select('*').gte('work_date', `${month}-01`).lte('work_date', `${month}-31`),
    supabase.from('schedule_requests').select('*').eq('work_month', month).order('submitted_at', { ascending: false }),
  ]);
  for (const result of [employeeResult, shiftResult, allowedResult, assignmentResult, requestResult]) if (result.error) throw result.error;
  const user = profileResult.data.session?.user;
  const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user?.id || '').maybeSingle();
  const profile = profiles || { id: user?.id, role: user?.role, employee_code: user?.user_metadata?.employee_code,
    branch_id: user?.branch_id, department: user?.department };
  const viewMode = localScheduleAccessMode(profile);
  let employees = employeeResult.data || [];
  if (viewMode === 'doctor_self') employees = employees.filter((item) => item.code === profile.employee_code);
  if (viewMode === 'doctor_roster') {
    // Roster viewers coordinate only with doctors at their own location.  A
    // URL/query parameter must not turn this screen into a cross-branch list.
    const rosterBranch = String(profile.branch_id || '').trim();
    employees = employees.filter((item) => item.department === 'bs' && item.branch_id === rosterBranch);
  }
  if (viewMode === 'manage_department' && profile.department) employees = employees.filter((item) => item.department === profile.department);
  if (branch !== 'all' && viewMode !== 'doctor_roster') employees = employees.filter((item) => item.branch_id === branch);
  if (department !== 'all' && viewMode !== 'doctor_roster') employees = employees.filter((item) => item.department === department);
  let codes = new Set(employees.map((item) => item.code));
  const latest = new Map();
  (requestResult.data || []).forEach((item) => { if (codes.has(item.employee_code) && !latest.has(item.employee_code)) latest.set(item.employee_code, item); });
  if (viewMode === 'doctor_roster') {
    const assignedCodes = new Set((assignmentResult.data || []).map((item) => item.employee_code));
    employees = employees.filter((employee) => {
      const request = latest.get(employee.code);
      return assignedCodes.has(employee.code) && isPublishedDoctorSchedule(request);
    });
    codes = new Set(employees.map((item) => item.code));
  }
  const requests = employees.map((employee) => {
    const request = latest.get(employee.code);
    return { employee_code: employee.code, id: request?.id || null, status: request?.status || 'pending', submitted_at: request?.submitted_at || null, ...parseWorkflow(request) };
  });
  return { month, profile, branch: viewMode === 'doctor_roster' ? profile.branch_id : branch,
    view_mode: viewMode, published_only: viewMode === 'doctor_roster', employees, shifts: shiftResult.data || [],
    allowed: (allowedResult.data || []).filter((item) => codes.has(item.employee_code)),
    assignments: (assignmentResult.data || []).filter((item) => codes.has(item.employee_code)), requests };
}

export async function getMonthlySchedule({ month, branch = 'all', department = 'all' }) {
  if (supabase.isLocal) {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user || {};
    const manager = ['admin', 'hr', 'admin_it', 'superadmin', 'admin_marketing', 'telesale_leader'].includes(user.role);
    const doctor = user.role === 'bac_si' || user.department === 'bs';
    if (!manager && !doctor) {
      return supabase.request(`/schedule/doctor-roster?${new URLSearchParams({ month, branch })}`);
    }
    return localMonthlySchedule({ month, branch, department });
  }
  return scheduleRequest(`?${new URLSearchParams({ month, branch, department })}`);
}

export async function saveMonthlySchedule(month, changes) {
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
          note: '[MONTHLY_SCHEDULE] Lịch đăng ký theo tháng' }).eq('id', existing.id);
        if (error) throw error;
        saved += 1;
      } else {
        const { error } = await supabase.from('schedule_assignments').insert({ employee_code: item.employee,
          work_date: item.date, shift_code: item.shift, status: 'planned', overtime_minutes: 0,
          early_arrival_minutes: 0, early_leave_minutes: 0, note: '[MONTHLY_SCHEDULE] Lịch đăng ký theo tháng' });
        if (error) throw error;
        saved += 1;
      }
    }
    return { saved, removed };
  }
  return scheduleRequest('', { method: 'POST', body: JSON.stringify({ month, changes }) });
}

export async function updateMonthlyScheduleWorkflow({ month, employee, action, note = '' }) {
  if (supabase.isLocal) {
    const { data, error } = await supabase.rpc('monthly_schedule_action', { month, employee, action, note });
    if (error) throw error;
    return data;
  }
  return scheduleRequest('', { method: 'POST', body: JSON.stringify({ month, employee, action, note }) });
}

export function subscribeMonthlySchedule(callback) {
  // The schedule view already performs a guarded 5-second refresh. Keeping
  // this no-op avoids an endless WebSocket reconnect loop on restricted mobile networks.
  const subscription = idleSubscription();
  return () => subscription.unsubscribe();
}
