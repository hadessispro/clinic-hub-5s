import { createClient } from '@supabase/supabase-js';
import { dispatchPushNotifications } from './_lib/push.js';

function clients() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !publishableKey) return null;
  return {
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    verifier: createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = clients();
  if (!db) return res.status(503).json({ error: 'Push service is not configured.' });
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: authData } = jwt ? await db.verifier.auth.getUser(jwt) : { data: {} };
  if (!authData?.user) return res.status(403).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  const id = String(req.body?.notificationId || '');
  const { data: notification, error } = await db.admin.from('notifications').select('*').eq('id', id).maybeSingle();
  if (error || !notification) return res.status(404).json({ error: 'Không tìm thấy thông báo.' });
  const result = await dispatchPushNotifications(db.admin, [notification]);
  return res.status(200).json(result);
}

