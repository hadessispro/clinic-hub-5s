import { supabase } from '../supabase.js';

/* ── Onboarding Docs Mapping ── */
export function mapDocToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    title: db.title,
    category: db.category,
    attachmentUrl: db.attachment_url || '',
    fileName: db.file_name || '',
    owner: db.owner_code || '',
    required: !!db.required,
    updatedAt: db.updated_at,
  };
}

export function mapDocToDB(ui) {
  return {
    title: ui.title,
    category: ui.category,
    attachment_url: ui.attachmentUrl || null,
    file_name: ui.fileName || null,
    owner_code: ui.owner || null,
    required: !!ui.required,
  };
}

/* ── Onboarding Progress Mapping ── */
export function mapProgressToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    employee: db.employee_code,
    doc: db.doc_id,
    status: db.status || 'todo',
    completedAt: db.completed_at || '',
  };
}

export function mapProgressToDB(ui) {
  return {
    employee_code: ui.employee,
    doc_id: ui.doc,
    status: ui.status || 'todo',
    completed_at: ui.completedAt || null,
  };
}

/* ── Service API ── */
export async function getOnboardingDocs() {
  try {
    const { data, error } = await supabase
      .from('onboarding_docs')
      .select('*')
      .order('created_at');
      
    if (error) throw error;
    return data.map(mapDocToUI);
  } catch (error) {
    console.error('[Onboarding Service] getOnboardingDocs error:', error);
    throw error;
  }
}

export async function createOnboardingDoc(doc) {
  try {
    const dbData = mapDocToDB(doc);
    const { data, error } = await supabase
      .from('onboarding_docs')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapDocToUI(data);
  } catch (error) {
    console.error('[Onboarding Service] createOnboardingDoc error:', error);
    throw error;
  }
}

export async function deleteOnboardingDoc(id) {
  try {
    const { error } = await supabase
      .from('onboarding_docs')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Onboarding Service] deleteOnboardingDoc (${id}) error:`, error);
    throw error;
  }
}

export async function getOnboardingProgress(employeeCode = null) {
  try {
    let query = supabase.from('onboarding_progress').select('*');
    if (employeeCode) {
      query = query.eq('employee_code', employeeCode);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data.map(mapProgressToUI);
  } catch (error) {
    console.error('[Onboarding Service] getOnboardingProgress error:', error);
    throw error;
  }
}

export async function updateOnboardingProgress(employeeCode, docId, status) {
  try {
    const completedAt = status === 'done' ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from('onboarding_progress')
      .upsert({
        employee_code: employeeCode,
        doc_id: docId,
        status,
        completed_at: completedAt,
      }, { onConflict: 'employee_code,doc_id' })
      .select()
      .single();
      
    if (error) throw error;
    return mapProgressToUI(data);
  } catch (error) {
    console.error('[Onboarding Service] updateOnboardingProgress error:', error);
    throw error;
  }
}
