import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

type JsonMap = Record<string, unknown>;
type OutboxRow = { id: string; entity_type: string; record_key: string; operation: 'upsert' | 'delete'; payload: JsonMap | null; attempts: number };

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!databaseUrl || !supabaseUrl || !supabaseKey) throw new Error('Missing PostgreSQL or Supabase backup configuration');

const postgres = new Pool({ connectionString: databaseUrl, max: 2 });
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const intervalMs = Math.max(5_000, Number(process.env.BACKUP_INTERVAL_SECONDS || 30) * 1_000);
const batchSize = Math.min(200, Math.max(1, Number(process.env.BACKUP_BATCH_SIZE || 50)));

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

async function syncRow(row: OutboxRow) {
  const table = row.entity_type;
  if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error(`Invalid backup table: ${table}`);
  if (row.operation === 'upsert') {
    const { error } = await supabase.from(table).upsert(row.payload || {});
    if (error) throw error;
    return;
  }
  const payload = row.payload || {};
  const key = payload.id ? ['id', payload.id]
    : payload.code ? ['code', payload.code]
      : payload.client_event_id ? ['client_event_id', payload.client_event_id]
        : null;
  if (!key) throw new Error(`No stable delete key for ${table}/${row.record_key}`);
  const { error } = await supabase.from(table).delete().eq(String(key[0]), key[1]);
  if (error) throw error;
}

async function drainOnce() {
  const result = await postgres.query<OutboxRow>(
    `select id::text,entity_type,record_key,operation,payload,attempts
     from app.backup_outbox where completed_at is null and next_attempt_at<=now()
     order by id asc limit $1`, [batchSize],
  );
  for (const row of result.rows) {
    try {
      await syncRow(row);
      await postgres.query('update app.backup_outbox set completed_at=now(),last_error=null where id=$1', [row.id]);
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(attempts, 8)));
      await postgres.query(
        `update app.backup_outbox set attempts=$2,last_error=$3,next_attempt_at=now()+($4 || ' seconds')::interval where id=$1`,
        [row.id, attempts, errorMessage(error).slice(0, 1000), delaySeconds],
      );
    }
  }
  return result.rowCount || 0;
}

async function main() {
  console.log('PostgreSQL -> Supabase backup worker started');
  while (true) {
    try {
      const count = await drainOnce();
      if (count) console.log(`Processed ${count} backup event(s)`);
    } catch (error) {
      console.error('Backup cycle failed:', errorMessage(error));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().finally(() => postgres.end());
