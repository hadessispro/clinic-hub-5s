import { createClient } from '@supabase/supabase-js';

const BUCKET = 'attendance-proofs';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function send(response, status, payload) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function ensurePrivateBucket(admin) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ['image/jpeg'],
  });
  if (error && !String(error.message).toLowerCase().includes('already exists')) throw error;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    send(response, 405, { error: 'Phương thức không được hỗ trợ.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !secretKey) {
    send(response, 503, { error: 'Máy chủ lưu ảnh chưa được cấu hình.' });
    return;
  }

  const authorization = String(request.headers.authorization || '');
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) {
    send(response, 401, { error: 'Bạn cần đăng nhập trước khi lưu ảnh.' });
    return;
  }

  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const clientEventId = String(body?.clientEventId || '');
  const capturedAt = String(body?.capturedAt || '');
  const mimeType = String(body?.mimeType || '');
  const imageBase64 = String(body?.imageBase64 || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientEventId)) {
    send(response, 400, { error: 'Mã lượt chấm công không hợp lệ.' });
    return;
  }
  if (mimeType !== 'image/jpeg' || !imageBase64) {
    send(response, 400, { error: 'Ảnh camera phải có định dạng JPEG.' });
    return;
  }

  let imageBytes;
  try { imageBytes = Buffer.from(imageBase64, 'base64'); } catch { imageBytes = null; }
  if (!imageBytes?.length || imageBytes.length > MAX_IMAGE_BYTES) {
    send(response, 413, { error: 'Ảnh camera rỗng hoặc vượt quá 2 MB.' });
    return;
  }

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData?.user;
  if (userError || !user) {
    send(response, 401, { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('employee_code,active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile?.active || !profile.employee_code) {
    send(response, 403, { error: 'Tài khoản chưa được phép lưu ảnh chấm công.' });
    return;
  }

  const { data: attendance, error: attendanceError } = await admin
    .from('attendance_records')
    .select('id,client_event_id,employee_code,work_date,recorded_at')
    .eq('client_event_id', clientEventId)
    .eq('created_by', user.id)
    .eq('employee_code', profile.employee_code)
    .maybeSingle();
  if (attendanceError || !attendance) {
    send(response, 404, { error: 'Chưa tìm thấy lượt chấm công tương ứng để gắn ảnh.' });
    return;
  }

  const capturedTime = new Date(capturedAt).getTime();
  const attendanceTime = new Date(attendance.recorded_at).getTime();
  if (!Number.isFinite(capturedTime) || Math.abs(capturedTime - attendanceTime) > 10 * 60 * 1000) {
    send(response, 400, { error: 'Thời gian chụp ảnh không khớp với lượt chấm công.' });
    return;
  }

  try {
    await ensurePrivateBucket(admin);
    const storagePath = `${user.id}/${attendance.work_date}/${clientEventId}.jpg`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, imageBytes, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
      metadata: { capturedAt, clientEventId },
    });
    if (uploadError) throw uploadError;

    const { error: updateError } = await admin
      .from('attendance_records')
      .update({ proof_url: storagePath })
      .eq('id', attendance.id)
      .eq('created_by', user.id);
    if (updateError) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      throw updateError;
    }

    send(response, 200, { ok: true, storagePath });
  } catch (error) {
    console.error('[Attendance Proof API] Upload failed:', error?.message || error);
    send(response, 500, { error: 'Không thể lưu ảnh chấm công. Vui lòng thử lại.' });
  }
}
