import { dataClient } from '../data-client.js';

export async function getProfiles() {
  try {
    const { data, error } = await dataClient
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
    const { data, error } = await dataClient
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
    const { data, error } = await dataClient
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
    const { error } = await dataClient
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

export async function createSystemUser(email, password) {
  return { id: crypto.randomUUID(), email, local_password: password };
}

export async function provisionSystemUser(profileId, email, password) {
  return dataClient.request('/auth/provision', { method: 'POST', body: JSON.stringify({ profileId, email, password }) });
}
