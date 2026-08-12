import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!url || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase service role key in environment' });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const email = 'thaibaoleo123@gmail.com';
    const password = '0366013107';

    // 1. Ensure the Supabase Auth identity exists and reset its credentials.
    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    let authUser = (listed.users || []).find((user) => user.email?.toLowerCase() === email);
    const authAttributes = {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Đào Thái Bảo', employee_code: 'PVC-IT', branch_id: 'all' },
    };
    if (authUser) {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, authAttributes);
      if (error) throw error;
      authUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser(authAttributes);
      if (error) throw error;
      authUser = data.user;
    }

    // 2. Upsert Admin IT into employees table.
    const { data: empData, error: empErr } = await admin.from('employees').upsert({
      code: 'PVC-IT',
      employee_number: '10999',
      branch_id: 'pham-van-chieu',
      full_name: 'Đào Thái Bảo',
      department: 'it',
      title: 'Quản trị IT',
      email,
      phone: password,
      status: 'active',
      manager_code: 'Tổng vận hành',
    }, { onConflict: 'code' }).select();

    if (empErr) throw empErr;

    // 3. Link the canonical profile to the Auth UID. Admin IT is branch-flexible
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
