const SESSION_KEY = '5s_vps_session_v1';

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function writeSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function api(path, options = {}) {
  const session = readSession();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout || 20000));
  try {
    const response = await fetch(`/api/v2${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && session?.refreshToken && !options._retried && path !== '/auth/refresh') {
      const refreshed = await fetch('/api/v2/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }), signal: controller.signal,
      });
      if (refreshed.ok) {
        const value = await refreshed.json();
        const user = authUser(value);
        writeSession({ ...value.session, user });
        clearTimeout(timeout);
        return api(path, { ...options, _retried: true });
      }
      writeSession(null);
      emitAuth('SIGNED_OUT', null);
    }
    if (!response.ok) {
      const error = new Error(payload.message || payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally { clearTimeout(timeout); }
}

class LocalQuery {
  constructor(table) {
    this.request = { table, operation: 'select', filters: [], order: [] };
    this.mode = 'many';
  }
  select() { return this; }
  insert(values) { this.request.operation = 'insert'; this.request.values = values; return this; }
  upsert(values) { this.request.operation = 'upsert'; this.request.values = values; return this; }
  update(values) { this.request.operation = 'update'; this.request.values = values; return this; }
  delete() { this.request.operation = 'delete'; return this; }
  filter(field, op, value) { this.request.filters.push({ field, op, value }); return this; }
  eq(field, value) { return this.filter(field, 'eq', value); }
  neq(field, value) { return this.filter(field, 'neq', value); }
  in(field, value) { return this.filter(field, 'in', value); }
  gte(field, value) { return this.filter(field, 'gte', value); }
  lte(field, value) { return this.filter(field, 'lte', value); }
  gt(field, value) { return this.filter(field, 'gt', value); }
  lt(field, value) { return this.filter(field, 'lt', value); }
  is(field, value) { return this.filter(field, 'is', value); }
  ilike(field, value) { return this.filter(field, 'ilike', value); }
  order(field, options = {}) { this.request.order.push({ field, ascending: options.ascending !== false }); return this; }
  limit(value) { this.request.limit = Number(value); return this; }
  range(from, to) { this.request.offset = Number(from); this.request.limit = Number(to) - Number(from) + 1; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybeSingle'; return this; }
  async execute() {
    try {
      const result = await api('/data/query', { method: 'POST', body: JSON.stringify(this.request) });
      let data = result.data;
      if (this.mode !== 'many') {
        const values = Array.isArray(data) ? data : (data ? [data] : []);
        if (this.mode === 'single' && values.length !== 1) throw new Error(`Cần đúng một bản ghi, nhận được ${values.length}.`);
        data = values[0] || null;
      }
      return { data, error: null };
    } catch (error) { return { data: null, error }; }
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

function authUser(payload) {
  const user = payload?.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    branch_id: user.branchId,
    department: user.department,
    user_metadata: { employee_code: user.employeeCode },
  };
}

const authListeners = new Set();
function emitAuth(event, session) {
  for (const listener of authListeners) listener(event, session);
}

export const localClient = {
  isLocal: true,
  request(path, options = {}) { return api(path, options); },
  from(table) { return new LocalQuery(table); },
  auth: {
    async getSession() {
      const stored = readSession();
      if (!stored?.accessToken) return { data: { session: null }, error: null };
      return { data: { session: { access_token: stored.accessToken, refresh_token: stored.refreshToken, user: stored.user } }, error: null };
    },
    async signInWithIdentifier({ identifier, password, branchId }) {
      try {
        const payload = await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password, branchId }) });
        const user = authUser(payload);
        const stored = { ...payload.session, user };
        writeSession(stored);
        const session = { access_token: stored.accessToken, refresh_token: stored.refreshToken, user };
        emitAuth('SIGNED_IN', session);
        return { data: { user, session }, error: null };
      } catch (error) { return { data: { user: null, session: null }, error }; }
    },
    async signOut() { writeSession(null); emitAuth('SIGNED_OUT', null); return { error: null }; },
    onAuthStateChange(listener) {
      authListeners.add(listener);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
    },
  },
  async rpc(name, args = {}) {
    try {
      const data = await api('/rpc/call', { method: 'POST', body: JSON.stringify({ name, args }) });
      return { data, error: null };
    } catch (error) { return { data: null, error }; }
  },
  channel() {
    return { on() { return this; }, subscribe() { return this; }, unsubscribe() {} };
  },
  removeChannel() {},
};
