import { createClient } from '@supabase/supabase-js';
import { localClient } from './local-client.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Mặc định chạy VPS backend trừ khi được chỉ định rõ ràng là dùng Supabase và có đủ khóa
const hasCloudConfig = Boolean(supabaseUrl && supabaseKey);
const useVpsBackend = (import.meta.env.VITE_DATA_BACKEND || 'vps') === 'vps' || !hasCloudConfig;

let cloudClient = null;
if (!useVpsBackend && hasCloudConfig) {
  try {
    cloudClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.error('[5S Clinic Hub] Failed to initialize Supabase client:', err);
  }
}

export const supabase = (useVpsBackend || !cloudClient) ? localClient : cloudClient;
