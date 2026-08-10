import { createClient } from '@supabase/supabase-js';
import { insertNotificationsAndPush } from './_lib/push.js';

const MANAGER_ROLES = new Set(['admin', 'hr', 'admin_it']);
const WORKFLOW = 'monthly_schedule_v1';

function clients() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !publishableKey) return null;
  return {
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    verifier: createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function authorize(req, db) {
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: authData } = await db.verifier.auth.getUser(jwt);
  if (!authData.user) return null;
  const { data: profile } = await db.admin.from('profiles')
    .select('id,employee_code,full_name,department,role,active,branch_id')
    .eq('id', authData.user.id).maybeSingle();
  if (!profile?.active) return null;
  return { ...profile, email: authData.user.email || '' };
}

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  if (year < 2024 || year > 2035 || monthNumber < 1 || monthNumber > 12) return null;
  const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(endDay).padStart(2, '0')}` };
}

function parseWorkflow(request) {
  let meta = {};
  try { meta = JSON.parse(request?.preference || '{}'); } catch { meta = {}; }
  if (meta.workflow !== WORKFLOW) meta = {};
  const fallback = request?.status === 'approved' ? 'approved' : request?.status === 'rejected' ? 'returned' : 'draft';
  return { workflow: WORKFLOW, stage: meta.stage || fallback, ...meta };
}

function requestPayload(meta) {
  return JSON.stringify({ workflow: WORKFLOW, ...meta });
}

async function getRequest(db, employeeCode, month) {
  const { data, error } = await db.admin.from('schedule_requests').select('*')
    .eq('employee_code', employeeCode).eq('work_month', month)
    .order('submitted_at', { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function saveRequest(db, employeeCode, month, meta, profile, status = 'pending') {
  const existing = await getRequest(db, employeeCode, month);
  const payload = {
    employee_code: employeeCode,
    work_month: month,
    preference: requestPayload(meta),
    status,
    reviewer_code: ['leader', 'hr', 'admin', 'admin_it'].includes(profile.role) ? profile.employee_code : null,
    submitted_at: new Date().toISOString(),
  };
  const query = existing
    ? db.admin.from('schedule_requests').update(payload).eq('id', existing.id)
    : db.admin.from('schedule_requests').insert(payload);
  const { error } = await query;
  if (error) throw error;
}

async function getLeaderScopes(db, profile) {
  const { data, error } = await db.admin.from('leader_scopes')
    .select('branch_id,department')
    .eq('leader_code', profile.employee_code || '__none__');
  if (error) throw error;
  const matchingScopes = (data || []).filter((item) => (
    !profile.department || item.department === profile.department
  ));
  if (matchingScopes.length) return matchingScopes;

  // Backward-compatible fallback: a department leader manages that department
  // company-wide even while the scope migration is still being applied.
  return profile.department
    ? [{ branch_id: null, department: profile.department }]
    : [];
}

async function scopedEmployees(db, profile, filters = {}) {
  let query = db.admin.from('employees')
    .select('code,full_name,department,title,branch_id,shift_code,manager_code,status')
    .eq('status', 'active').order('full_name');
  if (profile.role === 'staff') query = query.eq('code', profile.employee_code || '__none__');
  if (profile.role === 'leader') {
    const scopes = await getLeaderScopes(db, profile);
    const departments = [...new Set(scopes.map((item) => item.department).filter(Boolean))];
    const branches = [...new Set(scopes.map((item) => item.branch_id).filter(Boolean))];
    if (!departments.length) return [];
    query = query.in('department', departments);
    if (branches.length) query = query.in('branch_id', branches);
  }
  if (MANAGER_ROLES.has(profile.role)) {
    if (filters.branch && filters.branch !== 'all') query = query.eq('branch_id', filters.branch);
    if (filters.department && filters.department !== 'all') query = query.eq('department', filters.department);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function assertEmployeeScope(db, profile, employeeCode) {
  const employees = await scopedEmployees(db, profile, {});
  const employee = employees.find((item) => item.code === employeeCode);
  if (!employee) throw new Error('Nhân viên không thuộc phạm vi được phép thao tác.');
  return employee;
}

async function notifyProfiles(db, filters, title, body) {
  let query = db.admin.from('profiles').select('id').eq('active', true);
  if (filters.employeeCode) query = query.eq('employee_code', filters.employeeCode);
  if (filters.role) query = query.eq('role', filters.role);
  if (filters.branch) query = query.eq('branch_id', filters.branch);
  if (filters.department) query = query.eq('department', filters.department);
  const { data } = await query;
  const rows = (data || []).map((item) => ({ user_id: item.id, title, body, type: 'schedule', link_view: 'schedule' }));
  if (rows.length) await insertNotificationsAndPush(db.admin, rows);
}

async function notifyDepartmentLeaders(db, department, title, body) {
  const { data: scopes, error: scopeError } = await db.admin.from('leader_scopes')
    .select('leader_code')
    .eq('department', department);
  if (scopeError) throw scopeError;
  const leaderCodes = [...new Set((scopes || []).map((item) => item.leader_code).filter(Boolean))];
  if (leaderCodes.length) {
    let query = db.admin.from('profiles').select('id').eq('active', true).eq('role', 'leader');
    query = query.in('employee_code', leaderCodes);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map((item) => ({
      user_id: item.id, title, body, type: 'schedule', link_view: 'schedule',
    }));
    if (rows.length) await insertNotificationsAndPush(db.admin, rows);
    return;
  }
  await notifyProfiles(db, { role: 'leader', department }, title, body);
}

function actionPermission(action, profile) {
  if (profile.role === 'admin_it') return true;
  if (action === 'submit') return ['staff', 'leader'].includes(profile.role);
  if (['leader_forward', 'return_to_staff'].includes(action)) return profile.role === 'leader';
  if (['hr_approve', 'hr_return'].includes(action)) return ['hr', 'admin'].includes(profile.role);
  return false;
}

async function handleAction(db, profile, body) {
  const employeeCode = String(body.employee || '');
  const month = String(body.month || '');
  const action = String(body.action || '');
  const bounds = monthBounds(month);
  if (!employeeCode || !bounds || !actionPermission(action, profile)) throw new Error('Thao tác duyệt lịch không hợp lệ.');
  const employee = await assertEmployeeScope(db, profile, employeeCode);
  const existing = await getRequest(db, employeeCode, month);
  const current = parseWorkflow(existing);
  const note = String(body.note || '').trim().slice(0, 800);
  const now = new Date().toISOString();
  let next = { ...current };
  let status = 'pending';

  if (action === 'submit') {
    if (profile.role !== 'admin_it' && profile.employee_code !== employeeCode) throw new Error('Bạn chỉ có thể gửi lịch của chính mình.');
    const { count } = await db.admin.from('schedule_assignments').select('id', { count: 'exact', head: true })
      .eq('employee_code', employeeCode).gte('work_date', bounds.from).lte('work_date', bounds.to);
    if (!count) throw new Error('Hãy đăng ký ít nhất một ngày làm việc trước khi chốt lịch.');
    next = { ...next, stage: 'leader_review', employeeSubmittedAt: now, employeeNote: note, leaderNote: '', hrNote: '' };
    await notifyDepartmentLeaders(db, employee.department, 'Có lịch làm việc chờ duyệt', `${employee.full_name} đã chốt lịch tháng ${month}.`);
  } else if (action === 'leader_forward') {
    if (!['draft', 'returned', 'leader_review'].includes(current.stage)) {
      throw new Error('Lịch không ở bước trưởng bộ phận được phép xác nhận.');
    }
    const { count } = await db.admin.from('schedule_assignments').select('id', { count: 'exact', head: true })
      .eq('employee_code', employeeCode).gte('work_date', bounds.from).lte('work_date', bounds.to);
    if (!count) throw new Error('Lịch đang trống. Hãy phân ca ít nhất một ngày và lưu trước khi xác nhận.');
    next = { ...next, stage: 'hr_review', leaderReviewedAt: now, leaderNote: note };
    await notifyProfiles(db, { role: 'hr' }, 'Lịch tháng chờ tổng hợp', `${employee.full_name} đã được trưởng bộ phận duyệt lịch tháng ${month}.`);
    await notifyProfiles(db, { role: 'admin' }, 'Lịch tháng chờ hr.emily tổng hợp', `${employee.full_name} đã được trưởng bộ phận duyệt lịch tháng ${month}.`);
  } else if (action === 'return_to_staff') {
    if (current.stage !== 'leader_review') throw new Error('Lịch không ở bước trưởng bộ phận duyệt.');
    next = { ...next, stage: 'returned', returnedBy: 'leader', returnedAt: now, leaderNote: note };
    status = 'rejected';
    await notifyProfiles(db, { employeeCode }, 'Lịch làm việc cần chỉnh sửa', note || `Trưởng bộ phận yêu cầu rà lại lịch tháng ${month}.`);
  } else if (action === 'hr_approve') {
    if (current.stage !== 'hr_review') throw new Error('Lịch chưa được trưởng bộ phận chuyển đến phòng hành chính.');
    next = { ...next, stage: 'approved', hrReviewedAt: now, hrNote: note, finalApprover: profile.full_name || 'hr.emily' };
    status = 'approved';
    await notifyProfiles(db, { employeeCode }, 'Lịch làm việc đã được chốt', `Phòng hành chính đã chốt lịch tháng ${month}.`);
  } else if (action === 'hr_return') {
    if (current.stage !== 'hr_review') throw new Error('Lịch không ở bước phòng hành chính tổng hợp.');
    next = { ...next, stage: 'leader_review', returnedBy: 'hr', returnedAt: now, hrNote: note };
    await notifyDepartmentLeaders(db, employee.department, 'Lịch cần trưởng bộ phận rà lại', note || `${employee.full_name} cần rà lại lịch tháng ${month}.`);
  }
  await saveRequest(db, employeeCode, month, next, profile, status);
  return { stage: next.stage };
}

async function handleSave(db, profile, body) {
  const month = String(body.month || '');
  const bounds = monthBounds(month);
  const changes = Array.isArray(body.changes) ? body.changes.slice(0, 500) : [];
  if (!bounds || !changes.length) throw new Error('Không có thay đổi lịch hợp lệ để lưu.');
  const employeeCodes = [...new Set(changes.map((item) => String(item.employee || '')).filter(Boolean))];
  const allowedScope = await scopedEmployees(db, profile, {});
  const employeeMap = new Map(allowedScope.map((item) => [item.code, item]));
  if (employeeCodes.some((code) => !employeeMap.has(code))) throw new Error('Có nhân viên nằm ngoài phạm vi được phép.');

  for (const code of employeeCodes) {
    const request = await getRequest(db, code, month);
    const stage = parseWorkflow(request).stage;
    const editable = profile.role === 'admin_it'
      || (profile.role === 'staff' && ['draft', 'returned'].includes(stage))
      || (profile.role === 'leader' && ['draft', 'returned', 'leader_review'].includes(stage))
      || (['hr', 'admin'].includes(profile.role) && stage === 'hr_review');
    if (!editable) throw new Error(`Lịch của ${employeeMap.get(code).full_name} đang ở bước không thể sửa.`);
  }

  const shiftCodes = [...new Set(changes.map((item) => String(item.shift || '')).filter(Boolean))];
  const { data: allowed } = shiftCodes.length
    ? await db.admin.from('employee_allowed_shifts').select('employee_code,shift_code').in('employee_code', employeeCodes).in('shift_code', shiftCodes)
    : { data: [] };
  const pairs = new Set((allowed || []).map((item) => `${item.employee_code}:${item.shift_code}`));
  let saved = 0;
  let removed = 0;
  for (const item of changes) {
    const employee = String(item.employee || '');
    const date = String(item.date || '');
    const shift = String(item.shift || '');
    if (!employeeMap.has(employee) || date < bounds.from || date > bounds.to) continue;
    if (!shift) {
      const { error } = await db.admin.from('schedule_assignments').delete().eq('employee_code', employee).eq('work_date', date);
      if (error) throw error;
      removed += 1;
    } else {
      if (!pairs.has(`${employee}:${shift}`)) throw new Error('Ca được chọn chưa được cấp cho nhân viên.');
      const { error } = await db.admin.from('schedule_assignments').upsert({
        employee_code: employee, work_date: date, shift_code: shift,
        owner_code: profile.employee_code || null, status: 'planned',
        overtime_minutes: 0, early_arrival_minutes: 0, early_leave_minutes: 0,
        note: '[MONTHLY_SCHEDULE] Lịch đăng ký theo tháng',
      }, { onConflict: 'employee_code,work_date' });
      if (error) throw error;
      saved += 1;
    }
  }
  for (const code of employeeCodes) {
    const request = await getRequest(db, code, month);
    if (!request) await saveRequest(db, code, month, { stage: 'draft', savedAt: new Date().toISOString() }, profile);
  }
  return { saved, removed };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const db = clients();
  if (!db) return res.status(503).json({ error: 'Dịch vụ lịch làm việc chưa được cấu hình.' });
  const profile = await authorize(req, db);
  if (!profile) return res.status(403).json({ error: 'Phiên đăng nhập không hợp lệ hoặc tài khoản đã bị khóa.' });
  try {
    if (req.method === 'POST') {
      const result = req.body?.action
        ? await handleAction(db, profile, req.body)
        : await handleSave(db, profile, req.body || {});
      return res.status(200).json(result);
    }

    const month = String(req.query.month || '');
    const bounds = monthBounds(month);
    if (!bounds) return res.status(400).json({ error: 'Tháng không hợp lệ.' });
    const employees = await scopedEmployees(db, profile, { branch: String(req.query.branch || ''), department: String(req.query.department || '') });
    const codes = employees.map((item) => item.code);
    const [shiftResult, allowedResult, assignmentResult, requestResult] = await Promise.all([
      db.admin.from('work_shifts').select('code,name,start_time,end_time,break_minutes,active').eq('active', true).order('start_time'),
      codes.length ? db.admin.from('employee_allowed_shifts').select('employee_code,shift_code').in('employee_code', codes) : Promise.resolve({ data: [] }),
      codes.length ? db.admin.from('schedule_assignments').select('id,employee_code,work_date,shift_code,status,note').in('employee_code', codes).gte('work_date', bounds.from).lte('work_date', bounds.to) : Promise.resolve({ data: [] }),
      codes.length ? db.admin.from('schedule_requests').select('*').in('employee_code', codes).eq('work_month', month).order('submitted_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    const error = shiftResult.error || allowedResult.error || assignmentResult.error || requestResult.error;
    if (error) throw error;
    const latest = new Map();
    (requestResult.data || []).forEach((item) => { if (!latest.has(item.employee_code)) latest.set(item.employee_code, item); });
    const requests = employees.map((employee) => {
      const request = latest.get(employee.code);
      return { employee_code: employee.code, id: request?.id || null, status: request?.status || 'pending', submitted_at: request?.submitted_at || null, ...parseWorkflow(request) };
    });
    return res.status(200).json({ month, profile, employees, shifts: shiftResult.data || [], allowed: allowedResult.data || [], assignments: assignmentResult.data || [], requests });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Không thể xử lý lịch làm việc.' });
  }
}
