import { supabase } from '../supabase.js';
import { idleSubscription } from './realtime-fallback.js';

async function scheduleRequest(path = '', options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn.');
  const response = await fetch(`/api/monthly-schedule${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể xử lý lịch làm việc.');
  return result;
}

export function getMonthlySchedule({ month, branch = 'all', department = 'all' }) {
  return scheduleRequest(`?${new URLSearchParams({ month, branch, department })}`);
}

export function saveMonthlySchedule(month, changes) {
  return scheduleRequest('', { method: 'POST', body: JSON.stringify({ month, changes }) });
}

export function updateMonthlyScheduleWorkflow({ month, employee, action, note = '' }) {
  return scheduleRequest('', { method: 'POST', body: JSON.stringify({ month, employee, action, note }) });
}

export function subscribeMonthlySchedule(callback) {
  // The schedule view already performs a guarded 5-second refresh. Keeping
  // this no-op avoids an endless WebSocket reconnect loop on restricted mobile networks.
  const subscription = idleSubscription();
  return () => subscription.unsubscribe();
}
