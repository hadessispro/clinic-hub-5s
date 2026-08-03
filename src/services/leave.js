import { supabase } from '../supabase.js';

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
    to_date: ui.to || ui.from, // fallback if empty
    amount: ui.amount || 0,
    bank_account: ui.bankAccount || null,
    reason: ui.reason,
    status: ui.status || 'pending',
    leader_status: ui.leaderStatus || 'pending',
    operations_status: ui.operationsStatus || 'pending',
    reviewer_code: ui.reviewer || null,
    routed_to: ui.routedTo || 'ns',
  };
}

export async function getLeaveRequests(filters = {}) {
  try {
    let query = supabase
      .from('leave_requests')
      .select('*')
      .not('request_type', 'in', '("Tạm ứng lương","Ứng lương","Duyệt tiền mặt")'); // exclude advances
      
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
    const { data, error } = await supabase
      .from('leave_requests')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapLeaveToUI(data);
  } catch (error) {
    console.error('[Leave Service] createLeaveRequest error:', error);
    throw error;
  }
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
