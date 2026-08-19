import { supabase } from '../supabase.js';

export async function registerPgAccount(input) {
  if (!supabase.isLocal || typeof supabase.request !== 'function') {
    throw new Error('Đăng ký PG hiện chỉ khả dụng trên hệ thống VPS.');
  }
  return supabase.request('/auth/pg-register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
