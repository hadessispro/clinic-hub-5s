import { supabase } from '../supabase.js';
import { pollingSubscription } from './realtime-fallback.js';

export async function getSystemHealth() {
  const { data, error } = await supabase.rpc('get_system_health');
  if (error) throw error;
  const health = data || {};
  return {
    ...health,
    database: ['online', 'active', 'ok', 'healthy'].includes(String(health.database || '').toLowerCase()) ? 'online' : health.database,
    checked_at: health.checked_at || new Date().toISOString(),
    active_profiles: health.active_profiles ?? health.active_accounts ?? 0,
    inactive_profiles: health.inactive_profiles ?? health.inactive_accounts ?? 0,
    failed_sync: health.failed_sync ?? health.sync_errors ?? 0,
    pending_sync: health.pending_sync ?? 0,
  };
}

export async function getBugLogs(filters = {}) {
  let query = supabase.from('system_bug_logs').select('*').order('updated_at', { ascending: false }).limit(500);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.severity && filters.severity !== 'all') query = query.eq('severity', filters.severity);
  if (filters.area) query = query.ilike('area', `%${filters.area}%`);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (!filters.search) return rows;
  const needle = filters.search.trim().toLocaleLowerCase('vi');
  return rows.filter((row) => `${row.title || ''} ${row.description || ''}`.toLocaleLowerCase('vi').includes(needle));
}

export async function createBugLog(payload) {
  const { data, error } = await supabase.from('system_bug_logs').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateBugLog(id, updates) {
  const { data, error } = await supabase.from('system_bug_logs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function publishSystemAnnouncement(payload) {
  const { data, error } = await supabase.rpc('publish_system_announcement', {
    p_title: payload.title,
    p_body: payload.body,
    p_category: payload.category,
    p_audience: payload.audience,
  });
  if (error) throw error;
  return data;
}

export async function getSystemAnnouncements() {
  const { data, error } = await supabase.from('system_announcements').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

export async function getSystemProfiles() {
  const { data, error } = await supabase.from('profiles').select('id,full_name,employee_code,department,role,active,branch_id,updated_at').order('full_name');
  if (error) throw error;
  return data || [];
}

export async function updateUserAccess(userId, role, active) {
  const { data, error } = await supabase.rpc('system_update_user_access', { p_user_id: userId, p_role: role, p_active: active });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Mở khoá tài khoản bị chặn vì nhập sai mật khẩu nhiều lần.
//
// KHÔNG đổi mật khẩu. Mở khoá chỉ xoá bộ đếm sai; người dùng vẫn đăng nhập
// bằng mật khẩu cũ. Nếu họ quên hẳn mật khẩu thì mở khoá không giúp gì, và
// đó là lúc cần đặt lại — một việc khác, có người khác biết.
export async function unlockAccount(employeeCode) {
  const { data, error } = await supabase.rpc('system_unlock_account', { p_employee_code: employeeCode });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function getTechnicalAudit() {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return data || [];
}

export async function getIntegrationFailures() {
  const { data, error } = await supabase.from('integration_outbox').select('id,entity_type,entity_id,status,attempts,last_error,created_at,sent_at').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return data || [];
}

export async function getSystemErrorLogs() {
  const { data, error } = await supabase.from('system_error_logs').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

export async function resolveSystemError(id, resolved) {
  const { error } = await supabase.rpc('resolve_system_error', { p_error_id: id, p_resolved: resolved });
  if (error) throw error;
}

export function subscribeToSystemErrors(callback) {
  let newestId = null;
  return pollingSubscription(async () => {
    const { data } = await supabase.from('system_error_logs').select('id,updated_at')
      .order('updated_at', { ascending: false }).limit(1);
    const newest = data?.[0];
    if (!newestId) { newestId = newest?.id || null; return; }
    if (newest?.id && newest.id !== newestId) { newestId = newest.id; callback({ new: newest }); }
  }, 7000);
}
