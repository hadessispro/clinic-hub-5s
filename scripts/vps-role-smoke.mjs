import pg from 'pg';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4000/api/v2';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function candidate(role) {
  const result = await pool.query(`select p.payload->>'employee_code' code,e.payload->>'phone' phone
    from app.records p join app.records e on e.entity_type='employees' and e.deleted_at is null
      and lower(e.payload->>'code')=lower(p.payload->>'employee_code')
    where p.entity_type='profiles' and p.deleted_at is null and p.payload->>'role'=$1
      and coalesce((p.payload->>'active')::boolean,true)=true
      and length(regexp_replace(coalesce(e.payload->>'phone',''),'\D','','g'))>=8 limit 1`, [role]);
  return result.rows[0];
}

async function login(role) {
  const account = await candidate(role);
  if (!account) return { role, skipped: 'no unprovisioned account' };
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: account.code, password: account.phone }),
  });
  if (!response.ok) return { role, login: response.status };
  const payload = await response.json();
  return { role, login: response.status, token: payload.session.accessToken };
}

async function request(token, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.status;
}

try {
  for (const role of ['pg_staff', 'telesale_staff', 'support_marketing']) {
    const session = await login(role);
    const output = { role, login: session.login || session.skipped };
    if (session.token) {
      output.leads = await request(session.token, 'GET', '/marketing/leads');
      output.pgAccounts = await request(session.token, 'GET', '/marketing/pg-accounts');
      output.reports = await request(session.token, 'GET', '/marketing/reports');
      output.genericMarketingWrite = await request(session.token, 'POST', '/data/query', { table: 'marketing_leads', operation: 'insert', values: { id: 'forbidden-smoke' } });
    }
    console.log(JSON.stringify(output));
  }

  const pgSession = await login('pg_staff');
  const managerSession = await login('telesale_leader');
  if (pgSession.token && managerSession.token) {
    const marker = `SMOKE-${Date.now()}`;
    const create = await fetch(`${baseUrl}/marketing/leads`, {
      method: 'POST', headers: { authorization: `Bearer ${pgSession.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: marker, phone: '0900000000', dataClass: 'raw', source: 'smoke-test' }),
    });
    const created = await create.json();
    const invalidNet = await request(pgSession.token, 'POST', '/marketing/leads', { customerName: marker, phone: '0900000000', dataClass: 'net', netLevel: 'advanced' });
    const distributed = await request(managerSession.token, 'POST', '/marketing/leads/distribute-raw', { quantity: 1 });
    let removed = { status: 0, body: '' };
    if (created.data?.id) {
      const removeResponse = await fetch(`${baseUrl}/marketing/leads/${created.data.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${managerSession.token}` } });
      removed = { status: removeResponse.status, body: await removeResponse.text() };
    }
    console.log(JSON.stringify({ workflow: 'raw-distribution', create: create.status, invalidNet, distributed, removed }));
  }
  await pool.query("delete from marketing.leads where source='smoke-test'");
} finally {
  await pool.end();
}
