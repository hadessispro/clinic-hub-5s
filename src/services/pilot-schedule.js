import { supabase } from '../supabase.js';

async function pilotRequest(path = '', options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn.');
  const response = await fetch(`/api/pilot-schedule${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Không thể tải lịch thử nghiệm.');
  return result;
}

export function getPilotSchedule({ month, branch, department }) {
  const query = new URLSearchParams({ month, branch, department });
  return pilotRequest(`?${query}`);
}

export function savePilotScheduleChanges(changes) {
  return pilotRequest('', { method: 'POST', body: JSON.stringify({ changes }) });
}
