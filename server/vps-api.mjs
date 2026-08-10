import { createServer } from 'node:http';

const port = Number(process.env.PORT || 3000);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 15 * 1024 * 1024);

const handlers = new Map([
  ['admin-it-setup', () => import('../api/admin-it-setup.js')],
  ['archive-2months', () => import('../api/archive-2months.js')],
  ['attendance-proof', () => import('../api/attendance-proof.js')],
  ['attendance-record', () => import('../api/attendance-record.js')],
  ['monthly-schedule', () => import('../api/monthly-schedule.js')],
  ['pilot-schedule', () => import('../api/pilot-schedule.js')],
  ['push-dispatch', () => import('../api/push-dispatch.js')],
  ['push-subscription', () => import('../api/push-subscription.js')],
  ['sheet-sync', () => import('../api/sheet-sync.js')],
]);

function json(res, status, payload) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    json(res, res.statusCode || 200, payload);
    return res;
  };
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/json')) return JSON.parse(raw || '{}');
  return raw;
}

const server = createServer(async (req, res) => {
  decorateResponse(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    return json(res, 200, { ok: true, service: 'clinic-hub-api' });
  }

  const match = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
  const loader = match ? handlers.get(match[1]) : null;
  if (!loader) return json(res, 404, { error: 'Not found' });

  try {
    req.query = Object.fromEntries(url.searchParams.entries());
    req.body = await readBody(req);
    const module = await loader();
    await module.default(req, res);
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      route: url.pathname,
      message: String(error?.message || error),
      at: new Date().toISOString(),
    }));
    json(res, Number(error?.statusCode || 500), {
      error: error?.statusCode ? error.message : 'Internal server error',
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Clinic Hub API listening on :${port}`);
});

function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
