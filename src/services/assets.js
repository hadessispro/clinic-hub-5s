import { supabase } from '../supabase.js';

/* ── Assets Mapping ── */
export function mapAssetToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    code: db.code,
    name: db.name,
    department: db.department,
    location: db.location || '',
    custodian: db.custodian_code || '',
    condition: db.condition || 'good',
    checkedAt: db.checked_at || '',
    notes: db.notes || '',
  };
}

export function mapAssetToDB(ui) {
  return {
    code: ui.code,
    name: ui.name,
    department: ui.department,
    location: ui.location || '',
    custodian_code: ui.custodian || null,
    condition: ui.condition || 'good',
    checked_at: ui.checkedAt || null,
    notes: ui.notes || '',
  };
}

/* ── Asset Audits Mapping ── */
export function mapAssetAuditToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    title: db.title,
    department: db.department,
    owner: db.owner_code || '',
    due: db.due_date || '',
    fileName: db.file_name || '',
    attachmentUrl: db.attachment_url || '',
    status: db.status || 'pending',
    note: db.note || '',
  };
}

export function mapAssetAuditToDB(ui) {
  return {
    title: ui.title,
    department: ui.department,
    owner_code: ui.owner || null,
    due_date: ui.due || null,
    file_name: ui.fileName || null,
    attachment_url: ui.attachmentUrl || null,
    status: ui.status || 'pending',
    note: ui.note || '',
  };
}

/* ── Service API ── */
export async function getAssets() {
  try {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .order('code');
      
    if (error) throw error;
    return data.map(mapAssetToUI);
  } catch (error) {
    console.error('[Assets Service] getAssets error:', error);
    throw error;
  }
}

export async function createAsset(asset) {
  try {
    const dbData = mapAssetToDB(asset);
    const { data, error } = await supabase
      .from('assets')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapAssetToUI(data);
  } catch (error) {
    console.error('[Assets Service] createAsset error:', error);
    throw error;
  }
}

export async function updateAsset(id, updates) {
  try {
    const dbData = mapAssetToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('assets')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapAssetToUI(data);
  } catch (error) {
    console.error(`[Assets Service] updateAsset (${id}) error:`, error);
    throw error;
  }
}

export async function deleteAsset(id) {
  try {
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Assets Service] deleteAsset (${id}) error:`, error);
    throw error;
  }
}

export async function getAssetAudits() {
  try {
    const { data, error } = await supabase
      .from('asset_audits')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data.map(mapAssetAuditToUI);
  } catch (error) {
    console.error('[Assets Service] getAssetAudits error:', error);
    throw error;
  }
}

export async function createAssetAudit(audit) {
  try {
    const dbData = mapAssetAuditToDB(audit);
    const { data, error } = await supabase
      .from('asset_audits')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapAssetAuditToUI(data);
  } catch (error) {
    console.error('[Assets Service] createAssetAudit error:', error);
    throw error;
  }
}

export async function updateAssetAudit(id, updates) {
  try {
    const dbData = mapAssetAuditToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('asset_audits')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapAssetAuditToUI(data);
  } catch (error) {
    console.error(`[Assets Service] updateAssetAudit (${id}) error:`, error);
    throw error;
  }
}
