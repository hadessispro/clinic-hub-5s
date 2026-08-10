import { createClient } from '@supabase/supabase-js';

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
  const { data: profile } = await db.admin
    .from('profiles')
    .select('id,role,active')
    .eq('id', authData.user.id)
    .maybeSingle();
  return profile?.active && profile.role === 'admin_it' ? profile : null;
}

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(endDay).padStart(2, '0')}` };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const db = clients();
  if (!db) return res.status(503).json({ error: 'Pilot schedule service is not configured' });
  const profile = await authorize(req, db);
  if (!profile) return res.status(403).json({ error: 'Chức năng thử nghiệm chỉ dành cho Admin IT.' });

  if (req.method === 'POST') {
    const changes = Array.isArray(req.body?.changes) ? req.body.changes.slice(0, 500) : [];
    if (!changes.length) return res.status(400).json({ error: 'Không có thay đổi lịch để lưu.' });
    const employeeCodes = [...new Set(changes.map((item) => String(item.employee || '')).filter(Boolean))];
    const shiftCodes = [...new Set(changes.map((item) => String(item.shift || '')).filter(Boolean))];
    const [{ data: employees }, { data: allowed }] = await Promise.all([
      db.admin.from('employees').select('code').eq('status', 'active').in('code', employeeCodes),
      shiftCodes.length
        ? db.admin.from('employee_allowed_shifts').select('employee_code,shift_code').in('employee_code', employeeCodes).in('shift_code', shiftCodes)
        : Promise.resolve({ data: [] }),
    ]);
    const validEmployees = new Set((employees || []).map((item) => item.code));
    const validPairs = new Set((allowed || []).map((item) => `${item.employee_code}:${item.shift_code}`));
    let saved = 0;
    let removed = 0;
    for (const item of changes) {
      const employee = String(item.employee || '');
      const date = String(item.date || '');
      const shift = String(item.shift || '');
      if (!validEmployees.has(employee) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!shift) {
        const { error } = await db.admin.from('schedule_assignments').delete().eq('employee_code', employee).eq('work_date', date);
        if (error) return res.status(500).json({ error: error.message });
        removed += 1;
        continue;
      }
      if (!validPairs.has(`${employee}:${shift}`)) continue;
      const { error } = await db.admin.from('schedule_assignments').upsert({
        employee_code: employee,
        work_date: date,
        shift_code: shift,
        owner_code: null,
        status: 'planned',
        overtime_minutes: 0,
        early_arrival_minutes: 0,
        early_leave_minutes: 0,
        note: '[PILOT_ADMIN_IT] Đăng ký từ lịch tháng thử nghiệm',
      }, { onConflict: 'employee_code,work_date' });
      if (error) return res.status(500).json({ error: error.message });
      saved += 1;
    }
    return res.status(200).json({ saved, removed });
  }

  const month = String(req.query.month || '');
  const branch = String(req.query.branch || 'le-van-tho');
  const department = String(req.query.department || 'bs');
  const bounds = monthBounds(month);
  if (!bounds) return res.status(400).json({ error: 'Tháng không hợp lệ.' });
  const { data: employees, error: employeeError } = await db.admin
    .from('employees')
    .select('code,full_name,department,title,branch_id,shift_code')
    .eq('status', 'active')
    .eq('branch_id', branch)
    .eq('department', department)
    .order('full_name');
  if (employeeError) return res.status(500).json({ error: employeeError.message });
  const codes = (employees || []).map((employee) => employee.code);
  const [{ data: shifts, error: shiftError }, { data: allowed, error: allowedError }, assignmentResult] = await Promise.all([
    db.admin.from('work_shifts').select('code,name,start_time,end_time,break_minutes,active').eq('active', true).order('start_time'),
    codes.length ? db.admin.from('employee_allowed_shifts').select('employee_code,shift_code').in('employee_code', codes) : Promise.resolve({ data: [] }),
    codes.length
      ? db.admin.from('schedule_assignments').select('id,employee_code,work_date,shift_code,status,note').in('employee_code', codes).gte('work_date', bounds.from).lte('work_date', bounds.to)
      : Promise.resolve({ data: [] }),
  ]);
  if (shiftError || allowedError || assignmentResult.error) return res.status(500).json({ error: shiftError?.message || allowedError?.message || assignmentResult.error?.message });
  return res.status(200).json({ month, branch, department, employees: employees || [], shifts: shifts || [], allowed: allowed || [], assignments: assignmentResult.data || [] });
}
