import { supabase } from '../supabase.js';

/**
 * Uploads a file to the Supabase Storage bucket 'clinic-files'.
 * @param {File} file - The file object from browser input
 * @param {string} folder - Destination folder name (e.g. 'tasks', 'proposals', 'incidents')
 * @returns {Promise<{url: string, name: string}|null>} Public URL and original filename
 */
export async function uploadFile(file, folder = 'attachments') {
  if (!file) return null;
  if (supabase.isLocal) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch('/api/v2/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
      body: JSON.stringify({ name: file.name, type: file.type, folder, data: btoa(binary) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Không thể tải tệp lên VPS.');
    return { url: payload.publicUrl, name: file.name };
  }
  
  try {
    const fileExt = file.name.split('.').pop();
    const uniqueId = Math.random().toString(36).substring(2, 7);
    const filePath = `${folder}/${Date.now()}_${uniqueId}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('clinic-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('clinic-files')
      .getPublicUrl(filePath);

    return {
      url: publicUrl,
      name: file.name
    };
  } catch (error) {
    console.error('[Storage Service] Upload failed:', error);
    throw error;
  }
}
