import { supabase } from '../supabase.js';

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function hasVpsApi() { return Boolean(API_BASE_URL); }

export async function apiRequest(path, options = {}) {
  if (!API_BASE_URL) throw new Error('VITE_API_BASE_URL chưa được cấu hình.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `VPS API lỗi ${response.status}.`);
  return payload;
}
