import { supabase } from '../supabase.js';

/**
 * Uploads a file to the Supabase Storage bucket 'clinic-files'.
 * @param {File} file - The file object from browser input
 * @param {string} folder - Destination folder name (e.g. 'tasks', 'proposals', 'incidents')
 * @returns {Promise<{url: string, name: string}|null>} Public URL and original filename
 */
export async function uploadFile(file, folder = 'attachments') {
  if (!file) return null;
  
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
