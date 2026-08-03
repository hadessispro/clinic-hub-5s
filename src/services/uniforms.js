import { supabase } from '../supabase.js';

export function mapUniformToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    employee: db.employee_code,
    year: db.issued_year,
    item: db.item,
    quantity: Number(db.quantity || 1),
    size: db.size,
    issuedAt: db.issued_at,
    issuer: db.issuer_code || '',
    status: db.status || 'issued',
    note: db.note || '',
  };
}

export function mapUniformToDB(ui) {
  return {
    employee_code: ui.employee,
    issued_year: Number(ui.year),
    item: ui.item,
    quantity: Number(ui.quantity || 1),
    size: ui.size,
    issued_at: ui.issuedAt || new Date().toISOString().slice(0, 10),
    issuer_code: ui.issuer || null,
    status: ui.status || 'issued',
    note: ui.note || '',
  };
}

export async function getUniformLogs() {
  try {
    const { data, error } = await supabase
      .from('uniform_logs')
      .select('*')
      .order('issued_at', { ascending: false });
      
    if (error) throw error;
    return data.map(mapUniformToUI);
  } catch (error) {
    console.error('[Uniforms Service] getUniformLogs error:', error);
    throw error;
  }
}

export async function createUniformLog(log) {
  try {
    const dbData = mapUniformToDB(log);
    const { data, error } = await supabase
      .from('uniform_logs')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapUniformToUI(data);
  } catch (error) {
    console.error('[Uniforms Service] createUniformLog error:', error);
    throw error;
  }
}

export async function updateUniformLog(id, updates) {
  try {
    const dbData = mapUniformToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('uniform_logs')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapUniformToUI(data);
  } catch (error) {
    console.error(`[Uniforms Service] updateUniformLog (${id}) error:`, error);
    throw error;
  }
}

export async function deleteUniformLog(id) {
  try {
    const { error } = await supabase
      .from('uniform_logs')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Uniforms Service] deleteUniformLog (${id}) error:`, error);
    throw error;
  }
}
