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
    const data = await fileToBase64(file);
    const payload = await supabase.request('/files/upload', { method: 'POST',
      body: JSON.stringify({ name: file.name, type: file.type, folder, data }), timeout: 60000 });
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc ảnh trên thiết bị. Vui lòng chụp lại ảnh.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const separator = value.indexOf(',');
      if (separator < 0) reject(new Error('Dữ liệu ảnh không hợp lệ.'));
      else resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Thiết bị không đọc được định dạng ảnh này. Hãy chọn JPG/PNG hoặc chụp lại bằng camera.'));
    };
    image.src = url;
  });
}

/**
 * Chuẩn hóa ảnh chụp trên điện thoại trước khi gửi qua API JSON của VPS.
 * Ảnh nhỏ đã đúng định dạng được giữ nguyên; ảnh lớn/HEIC (nếu trình duyệt đọc
 * được) được xoay theo metadata, thu nhỏ và chuyển sang JPEG để tránh đầy RAM.
 */
export async function prepareImageForUpload(file, label = 'ảnh') {
  if (!file || !file.size) throw new Error(`Vui lòng chọn ${label}.`);
  const extensionLooksLikeImage = /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
  if (!(file.type || '').startsWith('image/') && !extensionLooksLikeImage) {
    throw new Error(`${label} phải là tệp hình ảnh.`);
  }
  if (file.size > 25 * 1024 * 1024) throw new Error(`${label} quá lớn. Vui lòng chọn ảnh dưới 25 MB.`);

  const directlySupported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (directlySupported && file.size <= 3 * 1024 * 1024) return file;

  let source;
  try {
    source = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file, { imageOrientation: 'from-image' })
      : await loadImage(file);
  } catch {
    source = await loadImage(file);
  }

  try {
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    if (!sourceWidth || !sourceHeight) throw new Error(`Không xác định được kích thước ${label}.`);
    const scale = Math.min(1, 1920 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error(`Không thể chuẩn hóa ${label}.`);
    const baseName = String(file.name || 'camera').replace(/\.[^.]+$/, '') || 'camera';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
  } finally {
    source.close?.();
  }
}
