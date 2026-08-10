import { createClient } from '@supabase/supabase-js';

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

async function authorize(req, db) {
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await db.verifier.auth.getUser(jwt);
  if (!data.user) return null;
  const { data: profile } = await db.admin.from('profiles').select('id,active,role').eq('id', data.user.id).maybeSingle();
  return profile?.active ? profile : null;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const db = clients();
  if (!db) return res.status(503).json({ error: 'Push service is not configured.' });
  const profile = await authorize(req, db);
  if (!profile) return res.status(403).json({ error: 'Phiên đăng nhập không hợp lệ.' });

  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
  }

  const endpoint = String(req.body?.endpoint || '').slice(0, 4000);
  if (!endpoint) return res.status(400).json({ error: 'Thiếu endpoint thiết bị.' });
  if (req.method === 'DELETE') {
    await db.admin.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() })
      .eq('endpoint', endpoint).eq('user_id', profile.id);
    return res.status(200).json({ ok: true });
  }

  const p256dh = String(req.body?.keys?.p256dh || '').slice(0, 1000);
  const authKey = String(req.body?.keys?.auth || '').slice(0, 1000);
  if (!p256dh || !authKey) return res.status(400).json({ error: 'Khóa đăng ký push không hợp lệ.' });
  const { error } = await db.admin.from('push_subscriptions').upsert({
    user_id: profile.id,
    endpoint,
    p256dh,
    auth_key: authKey,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

