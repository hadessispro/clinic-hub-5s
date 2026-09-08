import { supabase } from '../supabase.js';

/* ── Schedule Requests Mapping ── */
export function mapRequestToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    employee: db.employee_code,
    month: db.work_month,
    submittedAt: db.submitted_at,
    preference: db.preference,
    status: db.status || 'pending',
    reviewer: db.reviewer_code || '',
  };
}

export function mapRequestToDB(ui) {
  return {
    employee_code: ui.employee,
    work_month: ui.month,
    preference: ui.preference,
    status: ui.status || 'pending',
    reviewer_code: ui.reviewer || null,
  };
}

/* ── Schedule Assignments Mapping ── */
export function mapAssignmentToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    employee: db.employee_code,
    branchId: db.branch_id || '',
    date: db.work_date,
    shift: db.shift_code,
    owner: db.owner_code || '',
    swapWith: '', // Placeholder to maintain UI compatibility
    status: db.status || 'planned',
    overtimeMinutes: Number(db.overtime_minutes || 0),
    earlyArrivalMinutes: Number(db.early_arrival_minutes || 0),
    earlyLeaveMinutes: Number(db.early_leave_minutes || 0),
    note: db.note || '',
    proofUrl: db.proof_url || '',
  };
}

export function mapAssignmentToDB(ui) {
  return {
    employee_code: ui.employee,
    branch_id: ui.branchId || undefined,
    work_date: ui.date,
    shift_code: ui.shift,
    owner_code: ui.owner || null,
    status: ui.status || 'planned',
    overtime_minutes: Number(ui.overtimeMinutes || 0),
    early_arrival_minutes: Number(ui.earlyArrivalMinutes || 0),
    early_leave_minutes: Number(ui.earlyLeaveMinutes || 0),
    note: ui.note || '',
    proof_url: ui.proofUrl || null,
  };
}

/* ── Service API ── */
export async function getScheduleRequests() {
  try {
    const { data, error } = await supabase
      .from('schedule_requests')
      .select('*')
      .order('submitted_at', { ascending: false });
      
    if (error) throw error;
    return data.map(mapRequestToUI);
  } catch (error) {
    console.error('[Schedule Service] getScheduleRequests error:', error);
    throw error;
  }
}

export async function createScheduleRequest(request) {
  try {
    const dbData = mapRequestToDB(request);
    const { data, error } = await supabase
      .from('schedule_requests')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapRequestToUI(data);
  } catch (error) {
    console.error('[Schedule Service] createScheduleRequest error:', error);
    throw error;
  }
}

export async function updateScheduleRequest(id, updates) {
  try {
    const dbData = mapRequestToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('schedule_requests')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapRequestToUI(data);
  } catch (error) {
    console.error(`[Schedule Service] updateScheduleRequest (${id}) error:`, error);
    throw error;
  }
}

export async function getScheduleAssignments(date = null) {
  try {
    let query = supabase.from('schedule_assignments').select('*');
    if (date) {
      query = query.eq('work_date', date);
    }
    const { data, error } = await query.order('work_date');
    if (error) throw error;
    return data.map(mapAssignmentToUI);
  } catch (error) {
    console.error('[Schedule Service] getScheduleAssignments error:', error);
    throw error;
  }
}

export async function getShiftConfiguration() {
  const [shiftResult, allowedResult] = await Promise.all([
    supabase.from('work_shifts').select('*').eq('active', true).order('start_time'),
    supabase.from('employee_allowed_shifts').select('employee_code,shift_code'),
  ]);
  if (shiftResult.error) throw shiftResult.error;
  if (allowedResult.error) throw allowedResult.error;
  return { shifts: shiftResult.data || [], allowed: allowedResult.data || [] };
}

export async function getEmployeeAllowedShifts(employeeCode) {
  if (!employeeCode) return [];

  // The VPS data adapter intentionally exposes flat JSON records and ignores
  // PostgREST relationship expressions such as `work_shifts!inner(...)`.
  // Using that expression against the local PostgreSQL API returned allowed
  // rows without the nested `work_shifts` object, so every employee silently
  // fell back to one default shift in the check-in dialog. Load both flat
  // tables and join them here instead; this keeps the same result shape on
  // Supabase and PostgreSQL.
  if (supabase.isLocal) {
    const configuration = await getShiftConfiguration();
    const normalizedEmployeeCode = String(employeeCode).toLocaleLowerCase('vi');
    const allowedCodes = new Set(configuration.allowed
      .filter((row) => String(row.employee_code || '').toLocaleLowerCase('vi') === normalizedEmployeeCode)
      .map((row) => String(row.shift_code || ''))
      .filter(Boolean));
    return configuration.shifts
      .filter((shift) => shift.active !== false && allowedCodes.has(String(shift.code || '')))
      .sort((left, right) => String(left.start_time || '').localeCompare(String(right.start_time || '')));
  }

  const { data, error } = await supabase
    .from('employee_allowed_shifts')
    .select('shift_code, work_shifts!inner(code,name,start_time,end_time,break_minutes,active)')
    .eq('employee_code', employeeCode)
    .eq('work_shifts.active', true);
  if (error) throw error;
  return (data || [])
    .map((row) => row.work_shifts)
    .filter(Boolean)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

export async function createScheduleAssignment(assignment) {
  try {
    const dbData = mapAssignmentToDB(assignment);
    const { data: existing, error: findError } = await supabase.from('schedule_assignments')
      .select('*').eq('employee_code', dbData.employee_code).eq('work_date', dbData.work_date).maybeSingle();
    if (findError) throw findError;
    const query = existing?.id
      ? supabase.from('schedule_assignments').update(dbData).eq('id', existing.id)
      : supabase.from('schedule_assignments').insert(dbData);
    const { data, error } = await query.select().single();
      
    if (error) throw error;
    return mapAssignmentToUI(data);
  } catch (error) {
    console.error('[Schedule Service] createScheduleAssignment error:', error);
    throw error;
  }
}

export async function updateScheduleAssignment(id, updates) {
  try {
    const dbData = mapAssignmentToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('schedule_assignments')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapAssignmentToUI(data);
  } catch (error) {
    console.error(`[Schedule Service] updateScheduleAssignment (${id}) error:`, error);
    throw error;
  }
}

export async function deleteScheduleAssignment(id) {
  if (!id) return false;
  const { error } = await supabase.from('schedule_assignments').delete().eq('id', id);
  if (error) throw error;
  return true;
}
