import { chmod, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const [sourcePath = '.env.production.local', destinationPath = '.env.vps', domain = 'localhost'] = process.argv.slice(2);

function parseEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

const source = parseEnv(await readFile(sourcePath, 'utf8'));
const vapid = webpush.generateVAPIDKeys();
const secret = () => randomBytes(32).toString('base64url');
const value = (key, fallback = '') => source.get(key) || fallback;

const output = new Map([
  ['APP_DOMAIN', domain],
  ['ACME_EMAIL', 'admin@nhakhoa5s.vn'],
  ['VITE_SUPABASE_URL', value('VITE_SUPABASE_URL')],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', value('VITE_SUPABASE_PUBLISHABLE_KEY')],
  ['VITE_SUPABASE_ANON_KEY', value('VITE_SUPABASE_ANON_KEY')],
  ['SUPABASE_URL', value('SUPABASE_URL', value('VITE_SUPABASE_URL'))],
  ['SUPABASE_SECRET_KEY', value('SUPABASE_SECRET_KEY')],
  ['SUPABASE_SERVICE_ROLE_KEY', value('SUPABASE_SERVICE_ROLE_KEY')],
  ['GOOGLE_SHEETS_WEBHOOK_URL', value('GOOGLE_SHEETS_WEBHOOK_URL')],
  ['GOOGLE_SHEETS_SYNC_SECRET', value('GOOGLE_SHEETS_SYNC_SECRET')],
  ['CRON_SECRET', value('CRON_SECRET', secret())],
  ['ADMIN_SETUP_SECRET', secret()],
  ['VAPID_PUBLIC_KEY', value('VAPID_PUBLIC_KEY', vapid.publicKey)],
  ['VAPID_PRIVATE_KEY', value('VAPID_PRIVATE_KEY', vapid.privateKey)],
  ['VAPID_SUBJECT', value('VAPID_SUBJECT', 'mailto:admin@nhakhoa5s.vn')],
]);

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];
const missing = required.filter((key) => !output.get(key));
if (missing.length) throw new Error(`Missing required environment keys: ${missing.join(', ')}`);

const contents = [...output].map(([key, entry]) => `${key}=${entry}`).join('\n') + '\n';
await writeFile(destinationPath, contents, { encoding: 'utf8', mode: 0o600 });
await chmod(destinationPath, 0o600);
console.log(`Prepared ${destinationPath} with ${output.size} keys for ${domain}.`);
