import pg from 'pg';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4000/api/v2';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function candidate(role) {
  const result = await pool.query(`select p.payload->>'employee_code' code,e.payload->>'phone' phone,e.payload->>'email' email
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
    body: JSON.stringify({ identifier: account.code, password: account.phone, branchId: role === 'pg_staff' ? 'all' : undefined }),
  });
  if (!response.ok) return { role, login: response.status };
  const payload = await response.json();
  return { role, code: account.code, login: response.status, token: payload.session.accessToken };
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
      output.locationSearch = await request(session.token, 'GET', '/marketing/pg-location-search?q=248%20Pham%20Van%20Chieu%20Ho%20Chi%20Minh');
      output.genericMarketingWrite = await request(session.token, 'POST', '/data/query', { table: 'marketing_leads', operation: 'insert', values: { id: 'forbidden-smoke' } });
    }
    console.log(JSON.stringify(output));
  }

  const pgSession = await login('pg_staff');
  const managerSession = await login('telesale_leader');
  const telesaleSession = await login('telesale_staff');
  if (pgSession.token && managerSession.token && telesaleSession.token) {
    const marker = `SMOKE-${Date.now()}`;
    const create = await fetch(`${baseUrl}/marketing/leads`, {
      method: 'POST', headers: { authorization: `Bearer ${pgSession.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: marker, phone: '0900000000', dataClass: 'raw', source: 'smoke-test' }),
    });
    const created = await create.json();
    const invalidNet = await request(pgSession.token, 'POST', '/marketing/leads', { customerName: marker, phone: '0900000000', dataClass: 'net', netLevel: 'advanced' });
    const validNetResponse = await fetch(`${baseUrl}/marketing/leads`, {
      method: 'POST', headers: { authorization: `Bearer ${pgSession.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: `${marker}-NET`, phone: '0900000001', dataClass: 'net', netLevel: 'advanced', appointmentAt: new Date(Date.now() + 86_400_000).toISOString(), source: 'smoke-test' }),
    });
    const validNet = await validNetResponse.json();
    const distributed = await request(managerSession.token, 'POST', '/marketing/leads/distribute-raw', { quantity: 1 });
    const assigned = validNet.data?.id
      ? await request(managerSession.token, 'POST', `/marketing/leads/${validNet.data.id}/assign-net`, { telesaleCode: telesaleSession.code })
      : 0;
    const invalidAppointmentCall = validNet.data?.id
      ? await request(telesaleSession.token, 'POST', `/marketing/leads/${validNet.data.id}/calls`, { callStatus: 'appointment_booked', note: 'missing appointment timestamp' })
      : 0;
    const callCreated = validNet.data?.id
      ? await request(telesaleSession.token, 'POST', `/marketing/leads/${validNet.data.id}/calls`, { callStatus: 'appointment_booked', note: 'smoke call', appointmentAt: new Date(Date.now() + 172_800_000).toISOString() })
      : 0;
    const callHistory = validNet.data?.id
      ? await request(telesaleSession.token, 'GET', `/marketing/leads/${validNet.data.id}/calls`)
      : 0;
    const reports = await request(managerSession.token, 'GET', '/marketing/reports');
    let removed = { status: 0, body: '' };
    if (created.data?.id) {
      const removeResponse = await fetch(`${baseUrl}/marketing/leads/${created.data.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${managerSession.token}` } });
      removed = { status: removeResponse.status, body: await removeResponse.text() };
    }
    if (validNet.data?.id) {
      await fetch(`${baseUrl}/marketing/leads/${validNet.data.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${managerSession.token}` } });
    }
    console.log(JSON.stringify({ workflow: 'pg-to-telesale', create: create.status, invalidNet, validNet: validNetResponse.status, distributed, assigned, invalidAppointmentCall, callCreated, callHistory, reports, removed }));
  }
  await pool.query("delete from marketing.leads where source='smoke-test'");
} finally {
  await pool.end();
}
