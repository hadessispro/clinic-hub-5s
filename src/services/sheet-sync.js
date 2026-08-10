import { supabase } from '../supabase.js';

export async function requestSheetSync() {
  if (!navigator.onLine) return false;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  // PostgreSQL is the source of truth in VPS mode. Sheet export is an
  // asynchronous backup concern and must never block attendance writes.
  if (supabase.isLocal) return true;
  const response = await fetch('/api/sheet-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 503) throw new Error('Sheet sync failed');
  if (!response.ok) return false;
  const result = await response.json().catch(() => ({}));
  return Number(result.sent || 0) > 0;
}
