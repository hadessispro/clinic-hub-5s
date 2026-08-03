import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { BRANCH, branchSettings } from '../src/branch.js';

function loadLocalEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!match || process.env[match[1].trim()]) continue;
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Environment variables may be supplied by the terminal or CI instead.
  }
}

loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !adminKey) {
  throw new Error('Thiếu URL hoặc SUPABASE_SECRET_KEY trong .env.');
}

const admin = createClient(supabaseUrl, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const locationRow = {
  id: BRANCH.id,
  name: BRANCH.name,
  address: BRANCH.address,
  latitude: BRANCH.latitude,
  longitude: BRANCH.longitude,
  allowed_radius_m: BRANCH.allowedRadius,
  max_gps_accuracy_m: BRANCH.maxGpsAccuracy,
  checkin_time: BRANCH.checkinTime,
  checkin_grace_minutes: BRANCH.checkinGraceMinutes,
  time_zone: BRANCH.timeZone,
  active: true,
  updated_at: new Date().toISOString(),
};

const { error: locationError } = await admin
  .from('clinic_locations')
  .upsert(locationRow, { onConflict: 'id' });
if (locationError) throw locationError;

const { data: snapshot, error: snapshotReadError } = await admin
  .from('clinic_state_snapshots')
  .select('payload')
  .eq('id', 'main')
  .maybeSingle();
if (snapshotReadError) throw snapshotReadError;

const payload = {
  ...(snapshot?.payload || {}),
  settings: {
    ...(snapshot?.payload?.settings || {}),
    ...branchSettings(),
  },
};

const { error: snapshotError } = await admin
  .from('clinic_state_snapshots')
  .upsert({ id: 'main', payload, updated_at: new Date().toISOString() }, { onConflict: 'id' });
if (snapshotError) throw snapshotError;

const { data: savedLocation, error: verifyError } = await admin
  .from('clinic_locations')
  .select('id,name,address,latitude,longitude,allowed_radius_m')
  .eq('id', BRANCH.id)
  .single();
if (verifyError) throw verifyError;

console.log(JSON.stringify({
  updated: true,
  id: savedLocation.id,
  name: savedLocation.name,
  address: savedLocation.address,
  latitude: Number(savedLocation.latitude),
  longitude: Number(savedLocation.longitude),
  allowedRadius: Number(savedLocation.allowed_radius_m),
}, null, 2));
