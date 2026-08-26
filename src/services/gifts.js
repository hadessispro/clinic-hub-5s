import { supabase } from '../supabase.js';

function request(path, options = {}) {
  if (!supabase?.isLocal || !supabase?.request) throw new Error('Kho quà tặng chỉ khả dụng trên máy chủ Clinic Hub.');
  return supabase.request(`/marketing/gifts${path}`, options);
}

export async function getGiftOverview() { return request('/overview'); }
export async function getGiftMovements(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return request(`/movements?${query}`);
}
export async function createGiftItem(data) {
  return request('/items', { method: 'POST', body: JSON.stringify(data) });
}
export async function createGiftCategory(data) {
  return request('/categories', { method: 'POST', body: JSON.stringify(data) });
}
export async function createGiftMovement(data) {
  return request('/movements', { method: 'POST', body: JSON.stringify(data) });
}
