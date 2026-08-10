import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { classifyAttendance } from '../server/attendance-rules.mjs';

function parseEnv(text) {
  return Object.fromEntries(String(text).split(/\r?\n/).map((line) => {
    const index = line.indexOf('=');
    if (index < 1) return null;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\\r\\n$/g, '');
    return [key, value];
  }).filter(Boolean));
}

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
if (envIndex < 0 || !args[envIndex + 1]) throw new Error('Usage: node scripts/reconcile-attendance-status.mjs --env <path> [--apply]');
const env = parseEnv(await fs.readFile(args[envIndex + 1], 'utf8'));
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Supabase URL/service key is missing from the env file.');

const apply = args.includes('--apply');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: shifts, error: shiftError } = await db.from('work_shifts').select('code,start_time,end_time,break_minutes');
if (shiftError) throw shiftError;
const shiftByCode = new Map((shifts || []).map((shift) => [shift.code, shift]));

const records = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('attendance_records')
    .select('id,shift_code,record_type,recorded_at,status').order('recorded_at').range(from, from + 999);
  if (error) throw error;
  records.push(...(data || []));
  if ((data || []).length < 1000) break;
}

const changes = records.flatMap((record) => {
  const shift = shiftByCode.get(record.shift_code);
  if (!shift) return [];
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(record.recorded_at));
  const status = classifyAttendance({
    type: record.record_type,
    recordedTime: localTime,
    startTime: shift.start_time,
    endTime: shift.end_time,
    graceMinutes: 5,
  });
  return status === record.status ? [] : [{ id: record.id, from: record.status, to: status }];
});

if (apply) {
  for (const change of changes) {
    const { error } = await db.from('attendance_records').update({ status: change.to }).eq('id', change.id);
    if (error) throw error;
  }
  const { error } = await db.from('work_shifts').update({ break_minutes: 60 }).in('code', ['front-morning', 'front-afternoon']);
  if (error) throw error;
}

const summary = changes.reduce((result, change) => {
  const label = `${change.from || 'none'} -> ${change.to}`;
  result[label] = (result[label] || 0) + 1;
  return result;
}, {});
console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', records: records.length, changes: changes.length, summary }, null, 2));
