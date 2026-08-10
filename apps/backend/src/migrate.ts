import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const directory = process.env.MIGRATIONS_DIR || '/app/migrations';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await pool.query('create schema if not exists app');
    await pool.query(`create table if not exists app.schema_migrations (
      version text primary key, applied_at timestamptz not null default now()
    )`);
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const exists = await pool.query('select 1 from app.schema_migrations where version=$1', [file]);
      if (exists.rowCount) continue;
      const sql = await readFile(join(directory, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into app.schema_migrations(version) values ($1)', [file]);
        await client.query('commit');
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
