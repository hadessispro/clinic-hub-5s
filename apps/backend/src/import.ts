import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const defaultTables = [
  'profiles', 'employees', 'attendance_records', 'tasks', 'leave_requests', 'proposals',
  'inventory_items', 'purchase_requests', 'assets', 'asset_audits', 'uniform_logs',
  'onboarding_docs', 'onboarding_progress', 'recruitment', 'schedule_requests',
  'schedule_assignments', 'payroll_feedback', 'incidents', 'messages', 'notifications',
  'performance_metrics', 'audit_logs', 'clinic_state_snapshots', 'clinic_locations',
  'integration_outbox', 'system_bug_logs', 'system_announcements', 'system_error_logs',
  'work_shifts', 'employee_allowed_shifts', 'leader_scopes', 'push_subscriptions',
];

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !supabaseKey || !databaseUrl) throw new Error('Missing Supabase or PostgreSQL configuration');

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const postgres = new Pool({ connectionString: databaseUrl, max: 5 });
const runId = randomUUID();
const pageSize = 500;
const tables = String(process.env.MIGRATION_TABLES || defaultTables.join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean);

function recordKey(row: Record<string, unknown>) {
  const direct = row.id || row.code || row.client_event_id;
  if (direct) return String(direct);
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function importTable(table: string) {
  const { count: sourceCount, error: countError } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (countError) throw countError;
  let offset = 0;
  let imported = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    if (!rows.length) break;
    const client = await postgres.connect();
    try {
      await client.query('begin');
      for (const row of rows) {
        await client.query(
          `insert into migration.raw_records(table_name, record_key, payload, source_updated_at, imported_at, import_run_id)
           values ($1, $2, $3::jsonb, $4, now(), $5)
           on conflict (table_name, record_key) do update set
             payload = excluded.payload,
             source_updated_at = excluded.source_updated_at,
             imported_at = excluded.imported_at,
             import_run_id = excluded.import_run_id`,
          [table, recordKey(row), JSON.stringify(row), row.updated_at || row.created_at || null, runId],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    imported += rows.length;
    offset += rows.length;
    if (rows.length < pageSize) break;
  }
  await postgres.query(
    'delete from migration.raw_records where table_name = $1 and import_run_id is distinct from $2',
    [table, runId],
  );
  const shadowResult = await postgres.query<{ count: string }>(
    'select count(*)::text as count from migration.raw_records where table_name = $1',
    [table],
  );
  const shadowCount = Number(shadowResult.rows[0]?.count || 0);
  return {
    sourceCount: Number(sourceCount || 0),
    importedCount: imported,
    shadowCount,
    matchesSource: shadowCount === Number(sourceCount || 0),
  };
}

async function main() {
  const stats: Record<string, {
    status: string;
    sourceCount?: number;
    importedCount?: number;
    shadowCount?: number;
    matchesSource?: boolean;
    error?: string;
  }> = {};
  await postgres.query('insert into migration.import_runs(id, status, started_at) values ($1, $2, now())', [runId, 'running']);
  for (const table of tables) {
    try {
      const result = await importTable(table);
      stats[table] = { status: result.matchesSource ? 'matched' : 'mismatch', ...result };
      console.log(`${table}: source=${result.sourceCount} shadow=${result.shadowCount} matched=${result.matchesSource}`);
    } catch (error) {
      const message = errorMessage(error).slice(0, 500);
      stats[table] = { status: 'skipped', error: message };
      console.warn(`${table}: skipped (${message})`);
    }
  }
  const successful = Object.values(stats).filter((entry) => entry.status === 'matched' || entry.status === 'mismatch').length;
  const skipped = Object.values(stats).filter((entry) => entry.status === 'skipped').length;
  const runStatus = successful === 0 ? 'failed' : skipped > 0 ? 'completed_with_errors' : 'completed';
  await postgres.query(
    'update migration.import_runs set status=$2, finished_at=now(), stats=$3::jsonb where id=$1',
    [runId, runStatus, JSON.stringify(stats)],
  );
  // During the zero-downtime transition, refresh only records that still
  // originate from the Supabase bootstrap. VPS-owned records are never
  // overwritten by the compatibility import.
  if (successful > 0) {
    const functionExists = await postgres.query<{ available: boolean }>(
      `select to_regprocedure('app.bootstrap_from_shadow()') is not null as available`,
    );
    if (functionExists.rows[0]?.available) await postgres.query('select app.bootstrap_from_shadow()');
  }
  console.log(JSON.stringify({ runId, status: runStatus, stats }));
  if (runStatus === 'failed') process.exitCode = 1;
}

main().finally(() => postgres.end());
