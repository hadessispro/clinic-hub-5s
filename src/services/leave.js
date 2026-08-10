import { supabase } from '../supabase.js';
import { requestSheetSync } from './sheet-sync.js';
import { pollingSubscription } from './realtime-fallback.js';

export function mapLeaveToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    employee: db.employee_code,
    type: db.request_type,
    from: db.from_date,
    to: db.to_date,
    amount: Number(db.amount || 0),
    bankAccount: db.bank_account || '',
    startTime: db.request_start_time ? String(db.request_start_time).slice(0, 5) : '',
    endTime: db.request_end_time ? String(db.request_end_time).slice(0, 5) : '',
    overtimeMinutes: Number(db.overtime_minutes || 0),
    reason: db.reason,
    status: db.status || 'pending',
    leaderStatus: db.leader_status || 'pending',
    operationsStatus: db.operations_status || 'pending',
    reviewer: db.reviewer_code || '',
    routedTo: db.routed_to || 'ns',
    createdAt: db.created_at,
  };
}

export function mapLeaveToDB(ui) {
  return {
    employee_code: ui.employee,
    request_type: ui.type,
    from_date: ui.from,
    to_date: ui.to === undefined ? undefined : (ui.to || ui.from),
    amount: ui.amount === undefined ? undefined : Number(ui.amount || 0),
    bank_account: ui.bankAccount === undefined ? undefined : (ui.bankAccount || null),
    request_start_time: ui.startTime === undefined ? undefined : (ui.startTime || null),
    request_end_time: ui.endTime === undefined ? undefined : (ui.endTime || null),
    overtime_minutes: ui.overtimeMinutes === undefined ? undefined : Number(ui.overtimeMinutes || 0),
    reason: ui.reason,
    status: ui.status,
    leader_status: ui.leaderStatus,
    operations_status: ui.operationsStatus,
    reviewer_code: ui.reviewer === undefined ? undefined : (ui.reviewer || null),
    routed_to: ui.routedTo,
  };
}

export async function getLeaveRequests(filters = {}) {
  try {
    let query = supabase
      .from('leave_requests')
      .select('*');
      
    if (filters.employee) {
      query = query.eq('employee_code', filters.employee);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(mapLeaveToUI);
  } catch (error) {
    console.error('[Leave Service] getLeaveRequests error:', error);
    throw error;
  }
}

export function subscribeToLeaveRequests(callback) {
  let lastId = null;
  return pollingSubscription(async () => {
    const { data } = await supabase.from('leave_requests').select('id,created_at')
      .order('created_at', { ascending: false }).limit(1);
    const newest = data?.[0];
    if (!lastId) { lastId = newest?.id || null; return; }
    if (newest?.id && newest.id !== lastId) {
      lastId = newest.id;
      callback({ eventType: 'INSERT', new: newest });
    }
  }, 7000);
}

export async function getSalaryAdvances(filters = {}) {
  try {
    let query = supabase
      .from('leave_requests')
      .select('*')
      .in('request_type', ['Tạm ứng lương', 'Ứng lương', 'Duyệt tiền mặt']); // only advances
      
    if (filters.employee) {
      query = query.eq('employee_code', filters.employee);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(mapLeaveToUI);
  } catch (error) {
    console.error('[Leave Service] getSalaryAdvances error:', error);
    throw error;
  }
}

export async function createLeaveRequest(request) {
  try {
    const dbData = mapLeaveToDB(request);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });
    const { data, error } = await supabase.rpc('submit_leave_request', {
      p_employee_code: dbData.employee_code,
      p_request_type: dbData.request_type,
      p_from_date: dbData.from_date,
      p_to_date: dbData.to_date,
      p_reason: dbData.reason,
      p_amount: dbData.amount || 0,
      p_bank_account: dbData.bank_account || null,
      p_start_time: dbData.request_start_time || null,
      p_end_time: dbData.request_end_time || null,
      p_overtime_minutes: dbData.overtime_minutes || 0,
    });
      
    if (error) throw error;
    requestSheetSync().catch(() => {});
    return mapLeaveToUI(data);
  } catch (error) {
    console.error('[Leave Service] createLeaveRequest error:', error);
    throw error;
  }
}

export async function reviewLeaveRequest(id, decision, reason = '') {
  const { data, error } = await supabase.rpc('review_leave_request', {
    p_request_id: id,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) throw error;
  requestSheetSync().catch(() => {});
  return mapLeaveToUI(data);
}

export async function updateLeaveRequest(id, updates) {
  try {
    const dbData = mapLeaveToDB(updates);
    
    // Clean fields we don't want to update unless explicitly passed
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('leave_requests')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapLeaveToUI(data);
  } catch (error) {
    console.error(`[Leave Service] updateLeaveRequest (${id}) error:`, error);
    throw error;
  }
}

export async function deleteLeaveRequest(id) {
  try {
    const { error } = await supabase
      .from('leave_requests')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Leave Service] deleteLeaveRequest (${id}) error:`, error);
    throw error;
  }
}
