import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!url || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase service role key in environment' });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. Upsert Admin IT into employees table
    const { data: empData, error: empErr } = await admin.from('employees').upsert({
      code: 'PVC-IT',
      employee_number: '10999',
      branch_id: 'pham-van-chieu',
      full_name: 'Admin IT',
      department: 'it',
      title: 'Quản trị IT',
      status: 'active',
      manager_code: 'Tổng vận hành',
    }, { onConflict: 'code' }).select();

    if (empErr) {
      console.error('[Setup] Error upserting employee:', empErr);
    }

    // 2. Update profiles for admin_it to link employee_code = 'PVC-IT'
    const { data: profData, error: profErr } = await admin.from('profiles').update({
      employee_code: 'PVC-IT',
      full_name: 'Admin IT',
      department: 'it',
    }).eq('role', 'admin_it').select();

    if (profErr) {
      console.error('[Setup] Error updating profiles:', profErr);
    }

    // 3. Also check profiles that have email containing 'it' or 'admin'
    const { data: profEmailData } = await admin.from('profiles').update({
      employee_code: 'PVC-IT',
    }).or('role.eq.admin_it,email.ilike.%it%').select();

    return res.status(200).json({
      success: true,
      employee: empData,
      profilesUpdated: profData || profEmailData,
    });
  } catch (err) {
    console.error('[Setup] Exception:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
