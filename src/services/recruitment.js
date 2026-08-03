import { supabase } from '../supabase.js';

export function mapRecruitmentToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    candidate: db.candidate_name,
    role: db.target_role,
    department: db.department,
    responsible: db.responsible_code || '',
    stage: db.stage || 'screening',
    interviewDate: db.interview_date || '',
    autoSchedule: !!db.auto_schedule,
    salaryExpected: Number(db.salary_expected || 0),
    offerAmount: Number(db.offer_amount || 0),
    insuranceDate: db.insurance_date || '',
    status: db.status || 'pending',
    note: db.notes || '',
  };
}

export function mapRecruitmentToDB(ui) {
  return {
    candidate_name: ui.candidate,
    target_role: ui.role,
    department: ui.department,
    responsible_code: ui.responsible || null,
    stage: ui.stage || 'screening',
    interview_date: ui.interviewDate || null,
    auto_schedule: !!ui.autoSchedule,
    salary_expected: ui.salaryExpected || 0,
    offer_amount: ui.offerAmount || 0,
    insurance_date: ui.insuranceDate || null,
    status: ui.status || 'pending',
    notes: ui.note || '',
  };
}

export async function getRecruitmentList() {
  try {
    const { data, error } = await supabase
      .from('recruitment')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data.map(mapRecruitmentToUI);
  } catch (error) {
    console.error('[Recruitment Service] getRecruitmentList error:', error);
    throw error;
  }
}

export async function createCandidate(candidate) {
  try {
    const dbData = mapRecruitmentToDB(candidate);
    const { data, error } = await supabase
      .from('recruitment')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapRecruitmentToUI(data);
  } catch (error) {
    console.error('[Recruitment Service] createCandidate error:', error);
    throw error;
  }
}

export async function updateCandidate(id, updates) {
  try {
    const dbData = mapRecruitmentToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('recruitment')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapRecruitmentToUI(data);
  } catch (error) {
    console.error(`[Recruitment Service] updateCandidate (${id}) error:`, error);
    throw error;
  }
}

export async function deleteCandidate(id) {
  try {
    const { error } = await supabase
      .from('recruitment')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Recruitment Service] deleteCandidate (${id}) error:`, error);
    throw error;
  }
}
