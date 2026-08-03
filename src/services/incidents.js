import { supabase } from '../supabase.js';

export function mapIncidentToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    employee: db.employee_code,
    reporter: db.reporter_code || '',
    date: db.issue_date,
    category: db.category,
    title: db.title,
    proofUrl: db.proof_url || '',
    fileName: db.file_name || '',
    status: db.status || 'open',
    note: db.note || '',
  };
}

export function mapIncidentToDB(ui) {
  return {
    employee_code: ui.employee,
    reporter_code: ui.reporter || null,
    issue_date: ui.date || new Date().toISOString().slice(0, 10),
    category: ui.category,
    title: ui.title,
    proof_url: ui.proofUrl || null,
    file_name: ui.fileName || null,
    status: ui.status || 'open',
    note: ui.note || '',
  };
}

export async function getIncidents() {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data.map(mapIncidentToUI);
  } catch (error) {
    console.error('[Incidents Service] getIncidents error:', error);
    throw error;
  }
}

export async function createIncident(incident) {
  try {
    const dbData = mapIncidentToDB(incident);
    const { data, error } = await supabase
      .from('incidents')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapIncidentToUI(data);
  } catch (error) {
    console.error('[Incidents Service] createIncident error:', error);
    throw error;
  }
}

export async function updateIncident(id, updates) {
  try {
    const dbData = mapIncidentToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('incidents')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapIncidentToUI(data);
  } catch (error) {
    console.error(`[Incidents Service] updateIncident (${id}) error:`, error);
    throw error;
  }
}

export async function deleteIncident(id) {
  try {
    const { error } = await supabase
      .from('incidents')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Incidents Service] deleteIncident (${id}) error:`, error);
    throw error;
  }
}
