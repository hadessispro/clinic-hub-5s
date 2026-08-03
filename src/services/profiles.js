import { supabase } from '../supabase.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function getProfiles() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[Profiles Service] getProfiles error:', error);
    throw error;
  }
}

export async function createProfile(profile) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert(profile)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[Profiles Service] createProfile error:', error);
    throw error;
  }
}

export async function updateProfile(id, updates) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`[Profiles Service] updateProfile (${id}) error:`, error);
    throw error;
  }
}

export async function deleteProfile(id) {
  try {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Profiles Service] deleteProfile (${id}) error:`, error);
    throw error;
  }
}

/**
 * Creates a new Supabase Auth user without changing the current session.
 * Uses a temp client with persistSession: false.
 */
export async function createSupabaseUser(email, password) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Thiếu cấu hình VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY.');
  }

  const tempClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const { data, error } = await tempClient.auth.signUp({
    email,
    password
  });

  if (error) throw error;
  return data.user;
}
