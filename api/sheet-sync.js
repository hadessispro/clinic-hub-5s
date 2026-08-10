import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const webhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const syncSecret = process.env.GOOGLE_SHEETS_SYNC_SECRET;
  if (!url || !serviceKey || !webhook || !syncSecret) return res.status(503).json({ error: 'Sheet integration is not configured' });
  const isCron = req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const verifier = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || serviceKey);
    const { data } = await verifier.auth.getUser(jwt);
    if (!data.user) return res.status(401).json({ error: 'Unauthorized' });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: rows, error } = await admin.from('integration_outbox').select('*').in('status', ['pending', 'failed']).lt('attempts', 10).order('created_at').limit(100);
  if (error) return res.status(500).json({ error: error.message });
  const employeeCodes = [...new Set((rows || []).map(row => row.payload?.employee_code).filter(Boolean))];
  const { data: employees } = employeeCodes.length
    ? await admin.from('employees').select('code,full_name').in('code', employeeCodes)
    : { data: [] };
  const employeeNames = Object.fromEntries((employees || []).map(employee => [employee.code, employee.full_name]));
  const latestByEntity = new Map();
  for (const row of rows || []) latestByEntity.set(`${row.entity_type}:${row.entity_id}`, row);
  let sent = 0;
  for (const row of latestByEntity.values()) {
    try {
      const payload = { ...row.payload, employee_name: employeeNames[row.payload?.employee_code] || '' };
      const response = await fetch(`${webhook}${webhook.includes('?') ? '&' : '?'}secret=${encodeURIComponent(syncSecret)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: row.entity_type, id: row.entity_id, payload }) });
      const responseText = (await response.text()).trim();
      if (!response.ok || responseText.toLowerCase() !== 'ok') {
        throw new Error(`Webhook ${response.status}: ${responseText || 'empty response'}`);
      }
      await admin.from('integration_outbox').update({ status: 'sent', attempts: row.attempts + 1, sent_at: new Date().toISOString(), last_error: null }).eq('entity_type', row.entity_type).eq('entity_id', row.entity_id).in('status', ['pending', 'failed']);
      sent += 1;
    } catch (err) {
      await admin.from('integration_outbox').update({ status: 'failed', attempts: row.attempts + 1, last_error: String(err.message || err).slice(0, 500) }).eq('id', row.id);
    }
  }
  return res.status(200).json({ processed: (rows || []).length, sent, uniqueEntities: latestByEntity.size });
}
