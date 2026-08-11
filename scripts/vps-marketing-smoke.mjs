const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4000/api/v2';
const identifier = process.env.VPS_BOOTSTRAP_ADMIN_IDENTIFIER;
const password = process.env.VPS_BOOTSTRAP_ADMIN_PASSWORD;
if (!identifier || !password) throw new Error('Bootstrap smoke credentials are not configured');

const login = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identifier, password, branchId: 'pham-van-chieu' }),
});
console.log('login', login.status);
if (!login.ok) process.exit(1);
const session = await login.json();
for (const path of ['/marketing/pg-accounts', '/marketing/leads', '/marketing/reports', '/marketing/pg-sites']) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${session.session.accessToken}` } });
  const payload = await response.json();
  const summary = Array.isArray(payload.data) ? payload.data.length : Object.keys(payload.data || {}).join(',');
  console.log(path, response.status, summary);
  if (!response.ok) process.exitCode = 1;
}
