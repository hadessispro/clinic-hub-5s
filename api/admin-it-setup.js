import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!url || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase service role key in environment' });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Keep this endpoint metadata-only. Auth credentials must never be stored
    // in source code or reset through a public setup route.
    const email = process.env.ADMIN_IT_EMAIL || 'thaibaoleo123@gmail.com';
    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const authUser = (listed.users || []).find((user) => user.email?.toLowerCase() === email);
    if (!authUser) return res.status(409).json({ error: 'Admin IT Auth account is not provisioned.' });

    // Upsert Admin IT metadata.
    const { data: empData, error: empErr } = await admin.from('employees').upsert({
      code: 'PVC-IT',
      employee_number: '10999',
      branch_id: 'pham-van-chieu',
      full_name: 'Đào Thái Bảo',
      department: 'it',
      title: 'Quản trị IT',
      email,
      status: 'active',
      manager_code: 'Tổng vận hành',
    }, { onConflict: 'code' }).select();

    if (empErr) throw empErr;

    // Link the canonical profile to the Auth UID. Admin IT is branch-flexible
    // in the login guard, while branch_id remains the default attendance site.
    const { data: profData, error: profErr } = await admin.from('profiles').upsert({
      id: authUser.id,
      employee_code: 'PVC-IT',
      employee_number: '10999',
      full_name: 'Đào Thái Bảo',
      department: 'it',
      branch_id: 'pham-van-chieu',
      role: 'admin_it',
      active: true,
    }, { onConflict: 'id' }).select();

    if (profErr) throw profErr;

    return res.status(200).json({
      success: true,
      auth: { id: authUser.id, email: authUser.email },
      employee: empData,
      profilesUpdated: profData,
    });
  } catch (err) {
    console.error('[Setup] Exception:', err);
    return res.status(500).json({
      error: err?.message || String(err),
      code: err?.code || null,
      details: err?.details || null,
      hint: err?.hint || null,
    });
  }
}
