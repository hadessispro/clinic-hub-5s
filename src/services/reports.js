import { supabase } from '../supabase.js';

/* ── Performance Metrics Mapping ── */
export function mapMetricToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    month: db.work_month,
    department: db.department,
    revenue: Number(db.revenue || 0),
    target: Number(db.target || 0),
    leads: Number(db.leads || 0),
    appointments: Number(db.appointments || 0),
    score: Number(db.score || 0),
    note: db.note || '',
  };
}

export function mapMetricToDB(ui) {
  return {
    work_month: ui.month,
    department: ui.department,
    revenue: ui.revenue || 0,
    target: ui.target || 0,
    leads: ui.leads || 0,
    appointments: ui.appointments || 0,
    score: ui.score || 0,
    note: ui.note || '',
  };
}

/* ── Service API ── */
export async function getPerformanceMetrics() {
  try {
    const { data, error } = await supabase
      .from('performance_metrics')
      .select('*')
      .order('work_month', { ascending: false });
      
    if (error) throw error;
    return data.map(mapMetricToUI);
  } catch (error) {
    console.error('[Reports Service] getPerformanceMetrics error:', error);
    throw error;
  }
}

export async function createPerformanceMetric(metric) {
  try {
    const dbData = mapMetricToDB(metric);
    const { data, error } = await supabase
      .from('performance_metrics')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapMetricToUI(data);
  } catch (error) {
    console.error('[Reports Service] createPerformanceMetric error:', error);
    throw error;
  }
}

export async function updatePerformanceMetric(id, updates) {
  try {
    const dbData = mapMetricToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('performance_metrics')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapMetricToUI(data);
  } catch (error) {
    console.error(`[Reports Service] updatePerformanceMetric (${id}) error:`, error);
    throw error;
  }
}

/* ── Settings Sync ── */
export async function loadSettings() {
  try {
    const { data, error } = await supabase
      .from('clinic_state_snapshots')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();
      
    if (error) throw error;
    if (data && data.payload && data.payload.settings) {
      return data.payload.settings;
    }
    return null;
  } catch (error) {
    console.warn('[Reports Service] Failed to load settings from cloud, falling back to local defaults:', error);
    return null;
  }
}

export async function saveSettings(settings, userId) {
  try {
    const { error } = await supabase
      .from('clinic_state_snapshots')
      .upsert({
        id: 'main',
        payload: { settings },
        updated_by: userId,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[Reports Service] saveSettings error:', error);
    throw error;
  }
}
