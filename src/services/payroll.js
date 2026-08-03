import { supabase } from '../supabase.js';

export function mapFeedbackToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    employee: db.employee_code,
    month: db.work_month,
    text: db.text,
    status: db.status || 'open',
    createdAt: db.created_at,
  };
}

export function mapFeedbackToDB(ui) {
  return {
    employee_code: ui.employee,
    work_month: ui.month,
    text: ui.text,
    status: ui.status || 'open',
  };
}

export async function getPayrollFeedback() {
  try {
    const { data, error } = await supabase
      .from('payroll_feedback')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data.map(mapFeedbackToUI);
  } catch (error) {
    console.error('[Payroll Service] getPayrollFeedback error:', error);
    throw error;
  }
}

export async function createPayrollFeedback(feedback) {
  try {
    const dbData = mapFeedbackToDB(feedback);
    const { data, error } = await supabase
      .from('payroll_feedback')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapFeedbackToUI(data);
  } catch (error) {
    console.error('[Payroll Service] createPayrollFeedback error:', error);
    throw error;
  }
}

export async function updatePayrollFeedback(id, updates) {
  try {
    const dbData = mapFeedbackToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('payroll_feedback')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapFeedbackToUI(data);
  } catch (error) {
    console.error(`[Payroll Service] updatePayrollFeedback (${id}) error:`, error);
    throw error;
  }
}
