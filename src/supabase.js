import { createClient } from '@supabase/supabase-js';
import { localClient } from './local-client.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[5S Clinic Hub] Missing Supabase URL or publishable key in .env');
}

const cloudClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const supabase = import.meta.env.VITE_DATA_BACKEND === 'vps' ? localClient : cloudClient;
