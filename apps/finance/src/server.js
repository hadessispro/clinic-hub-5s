'use strict';
/**
 * Finance Vault · máy chủ.
 *
 * Chạy trong container riêng, tài khoản database riêng, khóa ký phiên riêng,
 * giao diện riêng. Không dùng lại một dòng nào của backend vận hành. Lý do:
 * một lỗi ở phân hệ vận hành không được phép trở thành đường vào sổ sách.
 *
 * Bốn thứ mọi endpoint đọc tiền đều phải đi qua:
 *   1. requireAuth  · phiên hợp lệ, tài khoản còn hoạt động
 *   2. requireRole  · đúng vai trò
 *   3. db.audit     · ghi vết ai đọc gì, lúc nào, từ IP nào
 *   4. tham số hóa  · không nối chuỗi vào SQL
 */
const path = require('node:path');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyMultipart = require('@fastify/multipart');

const db = require('./db');
const q = require('./queries');
const auth = require('./auth');
const crud = require('./crud');
const nhap = require('./nhap-lieu');
const bc = require('./bao-cao');

const PORT = Number(process.env.FINANCE_PORT || 4100);
const BASE = process.env.FINANCE_BASE_PATH || '/vault';

const app = Fastify({
  logger: { level: process.env.FINANCE_LOG_LEVEL || 'info' },
  trustProxy: true,
  bodyLimit: 2 * 1024 * 1024,
});

// Nhận file Excel tải lên. 40 MB đủ cho bộ sổ cả năm: file nhật ký thật của
// năm nay là 4,5 MB, và bản SQL sinh ra từ nó là 36 MB.
app.register(fastifyMultipart, { limits: { fileSize: 40 * 1024 * 1024, files: 1 } });

/* ── Vệ sinh chung ─────────────────────────────────────────────────────── */

app.addHook('onSend', async (req, reply, payload) => {
  // Sổ sách không bao giờ được nằm trong cache của trình duyệt hay proxy.
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  return payload;
});

function clientIp(req) {
  const raw = req.ip || '';
  // inet của Postgres không nhận dạng ::ffff:1.2.3.4
  return raw.startsWith('::ffff:') ? raw.slice(7) : (raw || null);
}

function fail(reply, code, message) {
  return reply.code(code).send({ loi: message });
}

/* ── Phiên đăng nhập ───────────────────────────────────────────────────── */

const REFRESH_COOKIE = 'finance_rt';

function sha256(v) {
  return createHash('sha256').update(String(v)).digest('hex');
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

function setRefreshCookie(reply, token) {
  const secure = process.env.FINANCE_INSECURE_COOKIE === '1' ? '' : ' Secure;';
  const maxAge = auth.REFRESH_TTL;
  reply.header('Set-Cookie',
    `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=${BASE}; HttpOnly;${secure} SameSite=Strict; Max-Age=${maxAge}`);
}

function clearRefreshCookie(reply) {
  const secure = process.env.FINANCE_INSECURE_COOKIE === '1' ? '' : ' Secure;';
  reply.header('Set-Cookie',
    `${REFRESH_COOKIE}=; Path=${BASE}; HttpOnly;${secure} SameSite=Strict; Max-Age=0`);
}

async function requireAuth(req, reply) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return fail(reply, 401, 'Chưa đăng nhập.');
  let payload;
  try {
    payload = auth.verify(header.slice(7));
  } catch (err) {
    return fail(reply, 401, err.message);
  }
  const user = await db.one(
    `select id::text, username, full_name, email, phone, role, is_active,
            must_change_password
     from finance.users where id = $1`,
    [payload.sub],
  );
  if (!user || !user.is_active) return fail(reply, 401, 'Tài khoản đã bị khóa.');
  // Đổi vai trò thì token cũ hết hiệu lực ngay, không đợi hết hạn.
  if (payload.role !== user.role) return fail(reply, 401, 'Vai trò đã thay đổi. Đăng nhập lại.');
  req.user = user;
}

function requireRole(...allowed) {
  return async (req, reply) => {
    if (!req.user) return fail(reply, 401, 'Chưa đăng nhập.');
    if (!allowed.includes(req.user.role)) {
      await db.audit({
        actor: req.user.username, actorRole: req.user.role,
        action: 'tu_choi_quyen', target: req.url, ip: clientIp(req),
      });
      return fail(reply, 403, 'Vai trò của bạn không được phép làm việc này.');
    }
  };
}

/**
 * Buộc đổi mật khẩu ở lần đăng nhập đầu là vô nghĩa nếu người dùng bỏ qua màn
 * hình đó và gọi thẳng API. Chặn ở máy chủ.
 */
async function requirePasswordChanged(req, reply) {
  if (req.user && req.user.must_change_password) {
    return fail(reply, 428, 'Phải đổi mật khẩu trước khi dùng tiếp.');
  }
}

const guard = { preHandler: [requireAuth, requirePasswordChanged] };
const guardAdmin = { preHandler: [requireAuth, requirePasswordChanged, requireRole('vault_admin')] };
const guardWrite = { preHandler: [requireAuth, requirePasswordChanged, requireRole('accountant', 'vault_admin')] };

/* ── Đăng nhập ─────────────────────────────────────────────────────────── */

app.post(`${BASE}/api/auth/login`, async (req, reply) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const ip = clientIp(req);
  if (!username || !password) return fail(reply, 400, 'Nhập tài khoản và mật khẩu.');

  const user = await db.one(
    `select id::text, username, password_hash, full_name, role, is_active,
            must_change_password, failed_attempts, locked_until
     from finance.users where lower(username) = lower($1)`,
    [username],
  );

  // Trả cùng một thông báo cho mọi trường hợp sai, để không lộ tài khoản nào có thật.
  const SAI = 'Sai tài khoản hoặc mật khẩu.';

  if (!user) {
    await db.audit({ actor: username, action: 'dang_nhap_that_bai', target: 'khong_co_tai_khoan', ip });
    // Vẫn tốn thời gian băm để hai nhánh mất thời gian như nhau.
    await auth.hashPassword(password);
    return fail(reply, 401, SAI);
  }
  if (!user.is_active) {
    await db.audit({ actor: username, action: 'dang_nhap_that_bai', target: 'tai_khoan_bi_khoa', ip });
    return fail(reply, 401, SAI);
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const phut = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    await db.audit({ actor: username, action: 'dang_nhap_that_bai', target: 'dang_bi_tam_khoa', ip });
    return fail(reply, 429, `Tài khoản đang tạm khóa. Thử lại sau ${phut} phút.`);
  }

  const ok = await auth.checkPassword(password, user.password_hash);
  if (!ok) {
    const lan = user.failed_attempts + 1;
    const khoa = lan >= auth.MAX_FAILED;
    await db.query(
      `update finance.users
         set failed_attempts = $2,
             locked_until = case when $3 then now() + ($4 || ' minutes')::interval else locked_until end
       where id = $1`,
      [user.id, khoa ? 0 : lan, khoa, String(auth.LOCK_MINUTES)],
    );
    await db.audit({
      actor: username, actorRole: user.role, action: 'dang_nhap_that_bai',
      target: khoa ? 'sai_qua_nhieu_lan_da_khoa' : 'sai_mat_khau',
      filters: { lan_thu: lan }, ip,
    });
    if (khoa) return fail(reply, 429, `Sai ${auth.MAX_FAILED} lần. Tài khoản tạm khóa ${auth.LOCK_MINUTES} phút.`);
    return fail(reply, 401, SAI);
  }

  const refresh = randomBytes(32).toString('base64url');
  await db.tx(async (c) => {
    await c.query(
      `update finance.users
         set failed_attempts = 0, locked_until = null, last_login_at = now()
       where id = $1`, [user.id],
    );
    await c.query(
      `insert into finance.sessions(user_id, refresh_hash, ip, user_agent, expires_at)
       values ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)`,
      [user.id, sha256(refresh), ip, String(req.headers['user-agent'] || '').slice(0, 300),
       String(auth.REFRESH_TTL)],
    );
  });
  await db.audit({ actor: username, actorRole: user.role, action: 'dang_nhap', ip });

  setRefreshCookie(reply, refresh);
  return {
    token: auth.sign({ sub: user.id, username: user.username, role: user.role }, auth.ACCESS_TTL),
    het_han_sau: auth.ACCESS_TTL,
    nguoi_dung: {
      id: user.id, username: user.username, full_name: user.full_name,
      role: user.role, must_change_password: user.must_change_password,
    },
  };
});

app.post(`${BASE}/api/auth/refresh`, async (req, reply) => {
  const raw = readCookie(req, REFRESH_COOKIE);
  if (!raw) return fail(reply, 401, 'Phiên đã kết thúc.');
  const s = await db.one(
    `select s.id::text, s.user_id::text, u.username, u.role, u.is_active,
            u.must_change_password
     from finance.sessions s join finance.users u on u.id = s.user_id
     where s.refresh_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
    [sha256(raw)],
  );
  if (!s || !s.is_active) {
    clearRefreshCookie(reply);
    return fail(reply, 401, 'Phiên đã kết thúc.');
  }
  // Xoay vòng: mỗi lần làm mới sinh chuỗi mới, chuỗi cũ vô hiệu ngay. Chuỗi bị
  // đánh cắp chỉ dùng được một lần, và lần dùng đó đá người thật ra ngoài.
  const next = randomBytes(32).toString('base64url');
  await db.query(
    `update finance.sessions set refresh_hash = $2 where id = $1`,
    [s.id, sha256(next)],
  );
  setRefreshCookie(reply, next);
  return {
    token: auth.sign({ sub: s.user_id, username: s.username, role: s.role }, auth.ACCESS_TTL),
    het_han_sau: auth.ACCESS_TTL,
  };
});

app.post(`${BASE}/api/auth/logout`, async (req, reply) => {
  const raw = readCookie(req, REFRESH_COOKIE);
  if (raw) {
    await db.query(
      `update finance.sessions set revoked_at = now()
       where refresh_hash = $1 and revoked_at is null`, [sha256(raw)],
    );
  }
  clearRefreshCookie(reply);
  return { xong: true };
});

/* ── Hồ sơ cá nhân · tài khoản tự sửa được thông tin của chính mình ────── */

app.get(`${BASE}/api/me`, { preHandler: requireAuth }, async (req) => ({
  ...req.user,
  het_han_sau: auth.ACCESS_TTL,
}));

app.patch(`${BASE}/api/me`, { preHandler: requireAuth }, async (req, reply) => {
  const full_name = req.body?.full_name === undefined ? null : String(req.body.full_name).trim();
  const email = req.body?.email === undefined ? null : String(req.body.email).trim();
  const phone = req.body?.phone === undefined ? null : String(req.body.phone).trim();
  if (full_name !== null && full_name.length < 2) return fail(reply, 400, 'Họ tên quá ngắn.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(reply, 400, 'Email không hợp lệ.');
  if (phone && !/^[0-9+\s.-]{8,20}$/.test(phone)) return fail(reply, 400, 'Số điện thoại không hợp lệ.');

  // asSelf đặt biến phiên để trigger ở database chặn tự nâng quyền. Kể cả khi
  // ai đó gửi thêm trường role vào thân yêu cầu, câu update dưới đây không hề
  // nhắc tới role nên nó không đi tới đâu, và trigger là lớp chặn thứ hai.
  const updated = await db.asSelf(req.user.id, async (c) => {
    const r = await c.query(
      `update finance.users
          set full_name = coalesce($2, full_name),
              email     = coalesce($3, email),
              phone     = coalesce($4, phone)
        where id = $1
        returning id::text, username, full_name, email, phone, role, must_change_password`,
      [req.user.id, full_name, email, phone],
    );
    return r.rows[0];
  });
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'sua_ho_so',
    target: req.user.username, ip: clientIp(req),
  });
  return updated;
});

app.post(`${BASE}/api/me/password`, { preHandler: requireAuth }, async (req, reply) => {
  const cu = String(req.body?.mat_khau_cu || '');
  const moi = String(req.body?.mat_khau_moi || '');
  const row = await db.one('select password_hash from finance.users where id = $1', [req.user.id]);
  if (!row || !(await auth.checkPassword(cu, row.password_hash))) {
    await db.audit({
      actor: req.user.username, actorRole: req.user.role,
      action: 'doi_mat_khau_that_bai', ip: clientIp(req),
    });
    return fail(reply, 401, 'Mật khẩu hiện tại không đúng.');
  }
  if (cu === moi) return fail(reply, 400, 'Mật khẩu mới phải khác mật khẩu cũ.');
  const van_de = auth.passwordProblems(moi);
  if (van_de.length) return fail(reply, 400, `Mật khẩu ${van_de.join(', ')}.`);

  await db.asSelf(req.user.id, async (c) => {
    await c.query(
      `update finance.users
          set password_hash = $2, must_change_password = false,
              password_changed_at = now()
        where id = $1`,
      [req.user.id, await auth.hashPassword(moi)],
    );
    // Đổi mật khẩu thì mọi phiên khác phải chết. Đây là việc người ta làm
    // khi nghi bị lộ.
    await c.query('update finance.sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [req.user.id]);
  });
  clearRefreshCookie(reply);
  await db.audit({
    actor: req.user.username, actorRole: req.user.role,
    action: 'doi_mat_khau', ip: clientIp(req),
  });
  return { xong: true, thong_bao: 'Đã đổi mật khẩu. Mọi phiên khác đã bị đăng xuất.' };
});

/* ── Đọc sổ ────────────────────────────────────────────────────────────── */

/** Bọc một endpoint đọc tiền: chạy truy vấn rồi ghi vết. */
function doc(action, fn) {
  return async (req, reply) => {
    const data = await fn(req, reply);
    if (reply.sent) return data;
    const rowCount = Array.isArray(data) ? data.length
      : Array.isArray(data?.dong) ? data.dong.length : null;
    await db.audit({
      actor: req.user.username, actorRole: req.user.role, action,
      target: req.params?.id || req.params?.code || null,
      filters: req.query || {}, rowCount, ip: clientIp(req),
    });
    return data;
  };
}

app.get(`${BASE}/api/tong-quan`, guard, doc('xem_tong_quan',
  (req) => q.overview(req.query.ky)));

app.get(`${BASE}/api/nhat-ky`, guard, doc('xem_nhat_ky_chung', (req) => q.journal({
  period: req.query.ky, account: req.query.tai_khoan, partner: req.query.doi_tac,
  from: req.query.tu_ngay, to: req.query.den_ngay, q: req.query.tim,
  deductible: req.query.hop_ly === undefined ? undefined : req.query.hop_ly === 'true',
  costItem: req.query.khoan_muc,
  sort: req.query.sap_xep, dir: req.query.chieu,
  limit: req.query.so_dong, offset: req.query.bo_qua,
})));

app.get(`${BASE}/api/chung-tu/:id`, guard, doc('xem_chung_tu', async (req, reply) => {
  const v = await q.voucher(req.params.id);
  if (!v) return fail(reply, 404, 'Không có chứng từ này.');
  return v;
}));

app.get(`${BASE}/api/can-doi`, guard, doc('xem_bang_can_doi',
  (req) => q.trialBalance(req.query.ky)));

app.get(`${BASE}/api/so-cai/:code`, guard, doc('xem_so_chi_tiet',
  (req) => q.ledger(req.params.code, req.query.ky)));

app.get(`${BASE}/api/cong-no`, guard, doc('xem_cong_no',
  (req) => q.partnerBalances(req.query.loai, req.query.ky)));

app.get(`${BASE}/api/chi-phi-khong-hop-ly`, guard, doc('xem_chi_phi_khong_hop_ly',
  (req) => q.nondeductible(req.query.ky)));

app.get(`${BASE}/api/soat-loi`, guard, doc('soat_loi',
  (req) => q.issues(req.query.ky)));

app.get(`${BASE}/api/bieu-do`, guard, doc('xem_bieu_do',
  (req) => q.charts(req.query.ky)));

app.get(`${BASE}/api/van-hanh`, guard, doc('xem_so_lieu_van_hanh',
  (req) => q.opsSummary({ canSeeIndividualPay: req.user.role !== 'viewer' })));

/* ── Danh mục ──────────────────────────────────────────────────────────── */

app.get(`${BASE}/api/tai-khoan`, guard, async (req) => q.accounts(req.query.tim));
// Tách hai nhóm vì hai nhóm này khác nhau về mọi mặt: khách hàng thì hàng
// nghìn, mã sinh tự động, ghi ở TK 131; đối tác thì hàng trăm, mã do kế toán
// đặt, ghi ở TK 331. Trộn chung một danh sách 6.662 dòng thì tìm nhà cung cấp
// nào cũng phải lội qua sáu nghìn cái tên bệnh nhân.
app.get(`${BASE}/api/doi-tac`, guard, async (req) =>
  q.partners(req.query.tim, req.query.loai, req.query.nhom));
app.get(`${BASE}/api/khoan-muc`, guard, async () => q.costItems());
app.get(`${BASE}/api/ky`, guard, async () => q.periods());
app.get(`${BASE}/api/lo-nhap`, guard, async () => q.batches());

/* ── Khóa kỳ ───────────────────────────────────────────────────────────── */

app.post(`${BASE}/api/ky/:code/trang-thai`, guardWrite, async (req, reply) => {
  const code = String(req.params.code);
  const status = String(req.body?.trang_thai || '');
  if (!['open', 'closed', 'locked'].includes(status)) {
    return fail(reply, 400, 'Trạng thái chỉ có thể là open, closed hoặc locked.');
  }
  // Mở lại kỳ đã khóa là việc nghiêm trọng: chỉ vault_admin làm được.
  const hienTai = await db.one('select status from finance.periods where code = $1', [code]);
  if (!hienTai) return fail(reply, 404, 'Không có kỳ này.');
  if (hienTai.status === 'locked' && status !== 'locked' && req.user.role !== 'vault_admin') {
    return fail(reply, 403, 'Chỉ quản trị két mới mở lại được kỳ đã khóa.');
  }
  const r = await db.one(
    `update finance.periods
        set status = $2,
            closed_at = case when $2 in ('closed','locked') then now() else null end,
            closed_by = case when $2 in ('closed','locked') then $3 else null end
      where code = $1 returning code, status, closed_at, closed_by`,
    [code, status, req.user.username],
  );
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'doi_trang_thai_ky',
    target: code, filters: { tu: hienTai.status, sang: status }, ip: clientIp(req),
  });
  return r;
});

/* ── Nhật ký truy cập · ai đọc gì ──────────────────────────────────────── */

app.get(`${BASE}/api/nhat-ky-truy-cap`, guardAdmin, async (req) => {
  const limit = Math.min(Math.max(Number(req.query.so_dong) || 200, 1), 1000);
  return db.rows(
    `select id::text, actor, actor_role, action, target, filters, row_count,
            host(ip) as ip, at
     from finance.access_log
     where ($1::text is null or actor = $1)
       and ($2::text is null or action = $2)
     order by at desc limit ${limit}`,
    [req.query.nguoi || null, req.query.hanh_dong || null],
  );
});

/* ── Quản trị người dùng ───────────────────────────────────────────────── */

app.get(`${BASE}/api/nguoi-dung`, guardAdmin, async () => db.rows(
  `select id::text, username, full_name, email, phone, role, is_active,
          must_change_password, failed_attempts, locked_until, last_login_at,
          password_changed_at, created_at
   from finance.users order by username`,
));

app.post(`${BASE}/api/nguoi-dung`, guardAdmin, async (req, reply) => {
  const username = String(req.body?.username || '').trim();
  const full_name = String(req.body?.full_name || '').trim();
  const role = String(req.body?.role || 'accountant');
  if (!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(username)) {
    return fail(reply, 400, 'Tên tài khoản 3 đến 32 ký tự, bắt đầu bằng chữ.');
  }
  if (full_name.length < 2) return fail(reply, 400, 'Nhập họ tên.');
  if (!['accountant', 'viewer', 'vault_admin'].includes(role)) {
    return fail(reply, 400, 'Vai trò không hợp lệ.');
  }
  // Mật khẩu tạm do máy sinh, hiện đúng một lần, và bắt đổi ngay lần đăng nhập đầu.
  const tam = randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9]/g, '') + 'Aa1!';
  const r = await db.one(
    `insert into finance.users(username, password_hash, full_name, role, must_change_password)
     values ($1, $2, $3, $4, true)
     on conflict (username) do nothing
     returning id::text, username, full_name, role`,
    [username, await auth.hashPassword(tam), full_name, role],
  );
  if (!r) return fail(reply, 409, 'Tên tài khoản đã tồn tại.');
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'tao_tai_khoan',
    target: username, filters: { vai_tro: role }, ip: clientIp(req),
  });
  return { ...r, mat_khau_tam: tam, luu_y: 'Mật khẩu này chỉ hiện một lần. Người dùng phải đổi ngay lần đăng nhập đầu.' };
});

app.patch(`${BASE}/api/nguoi-dung/:id`, guardAdmin, async (req, reply) => {
  const id = String(req.params.id);
  if (id === req.user.id) {
    // Trigger ở database cũng chặn, nhưng chặn sớm thì thông báo dễ hiểu hơn.
    return fail(reply, 403, 'Không tự đổi vai trò hay trạng thái của chính mình. Nhờ quản trị viên khác.');
  }
  const role = req.body?.role === undefined ? null : String(req.body.role);
  const is_active = req.body?.is_active === undefined ? null : Boolean(req.body.is_active);
  if (role !== null && !['accountant', 'viewer', 'vault_admin'].includes(role)) {
    return fail(reply, 400, 'Vai trò không hợp lệ.');
  }
  const r = await db.one(
    `update finance.users
        set role = coalesce($2, role), is_active = coalesce($3, is_active),
            locked_until = case when $3 is true then null else locked_until end,
            failed_attempts = case when $3 is true then 0 else failed_attempts end
      where id = $1
      returning id::text, username, full_name, role, is_active`,
    [id, role, is_active],
  );
  if (!r) return fail(reply, 404, 'Không có tài khoản này.');
  if (is_active === false) {
    await db.query('update finance.sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [id]);
  }
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'sua_tai_khoan',
    target: r.username, filters: { vai_tro: role, kich_hoat: is_active }, ip: clientIp(req),
  });
  return r;
});

/* ── Thêm sửa xóa chứng từ ─────────────────────────────────────────────── */

app.post(`${BASE}/api/chung-tu`, guardWrite, async (req, reply) => {
  const r = await crud.taoChungTu(req.body || {}, req.user.username);
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'tao_chung_tu',
    target: r.so_chung_tu, rowCount: r.so_dong, ip: clientIp(req),
  });
  return reply.code(201).send(r);
});

app.put(`${BASE}/api/chung-tu/:id`, guardWrite, async (req) => {
  const r = await crud.suaChungTu(req.params.id, req.body || {}, req.user.username);
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'sua_chung_tu',
    target: req.params.id, rowCount: r.so_dong, ip: clientIp(req),
  });
  return r;
});

app.delete(`${BASE}/api/chung-tu/:id`, guardWrite, async (req) => {
  const so = await crud.xoaChungTu(req.params.id);
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'xoa_chung_tu',
    target: so, ip: clientIp(req),
  });
  return { xong: true, so_chung_tu: so };
});

/* ── Thêm sửa xóa danh mục ─────────────────────────────────────────────── */

function danhMuc(duong, luu, xoa, ten) {
  app.post(`${BASE}/api/${duong}`, guardWrite, async (req) => {
    const r = await luu(req.body || {});
    await db.audit({
      actor: req.user.username, actorRole: req.user.role, action: `luu_${ten}`,
      target: r.code, ip: clientIp(req),
    });
    return r;
  });
  app.delete(`${BASE}/api/${duong}/:code`, guardWrite, async (req) => {
    const ma = await xoa(req.params.code);
    await db.audit({
      actor: req.user.username, actorRole: req.user.role, action: `xoa_${ten}`,
      target: ma, ip: clientIp(req),
    });
    return { xong: true, code: ma };
  });
}

danhMuc('tai-khoan', crud.luuTaiKhoan, crud.xoaTaiKhoan, 'tai_khoan');
danhMuc('doi-tac',   crud.luuDoiTac,   crud.xoaDoiTac,   'doi_tac');
danhMuc('khoan-muc', crud.luuKhoanMuc, crud.xoaKhoanMuc, 'khoan_muc');

/* ── Nhập liệu từ Excel ────────────────────────────────────────────────── */

app.post(`${BASE}/api/nhap-lieu/kiem-tra`, guardWrite, async (req, reply) => {
  const file = await req.file();
  if (!file) return fail(reply, 400, 'Chưa chọn file.');
  if (!/\.xlsx?$/i.test(file.filename)) {
    return fail(reply, 400, 'Chỉ nhận file .xlsx. File .xls đời cũ phải lưu lại dạng .xlsx trước.');
  }
  const buffer = await file.toBuffer();

  let doc;
  try {
    doc = await nhap.docFile(buffer, file.filename);
  } catch (err) {
    return fail(reply, 400, err.message);
  }
  const ketQua = await nhap.kiemTra(doc);
  const batchId = await nhap.luuTam(doc, ketQua, req.user.username);

  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'tai_len_file_nhap',
    target: file.filename, rowCount: doc.dong.length,
    filters: { loai: doc.loai, sha256: doc.sha256.slice(0, 16), loi: ketQua.loi.length },
    ip: clientIp(req),
  });

  return {
    lo: batchId, ten_file: doc.ten_file, loai: doc.loai,
    ten_loai: nhap.LOAI[doc.loai].ten, sheet: doc.sheet,
    ...ketQua,
  };
});

app.post(`${BASE}/api/nhap-lieu/:id/ghi-so`, guardWrite, async (req) => {
  const n = await nhap.ghiSo(req.params.id, req.user.username);
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'ghi_so_tu_lo_nhap',
    target: req.params.id, rowCount: n, ip: clientIp(req),
  });
  return { xong: true, so_ban_ghi: n };
});

app.post(`${BASE}/api/nhap-lieu/:id/huy`, guardWrite, async (req) => {
  await nhap.huy(req.params.id);
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'huy_lo_nhap',
    target: req.params.id, ip: clientIp(req),
  });
  return { xong: true };
});

app.post(`${BASE}/api/nhap-lieu/:id/hoan-tac`, guardAdmin, async (req) => {
  const n = await nhap.hoanTac(req.params.id, req.user.username);
  await db.audit({
    actor: req.user.username, actorRole: req.user.role, action: 'hoan_tac_lo_nhap',
    target: req.params.id, rowCount: n, ip: clientIp(req),
  });
  return { xong: true, so_chung_tu_da_xoa: n };
});

app.get(`${BASE}/api/nhap-lieu/:id`, guard, async (req, reply) => {
  const lo = await db.one(
    `select id::text, source_file, left(source_sha256, 16) as van_tay, sheet_names,
            row_count, status, recon, errors, created_by, created_at,
            posted_by, posted_at, reverted_at
     from finance.import_batches where id = $1`, [req.params.id],
  );
  if (!lo) return fail(reply, 404, 'Không có lô nhập này.');
  lo.xem_thu = (await db.rows(
    'select row_no, raw from finance.import_rows where batch_id = $1 order by id limit 100',
    [req.params.id],
  ));
  return lo;
});

/* ── Báo cáo · tất cả dựng lại từ Sổ nhật ký chung ─────────────────────── */

app.get(`${BASE}/api/bc/so-quy`, guard, doc('xem_so_quy_tien_mat', (req) =>
  bc.soQuyTienMat({ period: req.query.ky, from: req.query.tu_ngay, to: req.query.den_ngay })));

app.get(`${BASE}/api/bc/tai-khoan-ngan-hang`, guard, async () => bc.taiKhoanNganHang());

app.get(`${BASE}/api/bc/so-ngan-hang`, guard, doc('xem_so_ngan_hang', (req) =>
  bc.soNganHang({ account: req.query.tai_khoan, period: req.query.ky,
                  from: req.query.tu_ngay, to: req.query.den_ngay })));

app.get(`${BASE}/api/bc/tong-hop-cong-no`, guard, doc('xem_tong_hop_cong_no', (req) =>
  bc.tongHopCongNo({ loai: req.query.loai, period: req.query.ky })));

app.get(`${BASE}/api/bc/chi-tiet-cong-no`, guard, doc('xem_chi_tiet_cong_no', (req) =>
  bc.chiTietCongNo({ loai: req.query.loai, partner: req.query.doi_tac, period: req.query.ky })));

app.get(`${BASE}/api/bc/dong-tien`, guard, doc('xem_dong_tien', (req) =>
  bc.dongTien({ period: req.query.ky })));

app.get(`${BASE}/api/bc/b01`, guard, doc('xem_bao_cao_tinh_hinh_tai_chinh', () =>
  bc.baoCaoTinhHinhTaiChinh()));

app.get(`${BASE}/api/bc/cay-tai-khoan`, guard, async () => bc.cayTaiKhoan());

app.get(`${BASE}/api/bc/so-chi-tiet/:code`, guard, doc('xem_so_chi_tiet_tai_khoan', async (req, reply) => {
  const r = await bc.soChiTietTaiKhoan({
    account: req.params.code, period: req.query.ky,
    from: req.query.tu_ngay, to: req.query.den_ngay,
    gomCon: req.query.gom_con !== 'false',
  });
  if (!r) return fail(reply, 404, 'Không có tài khoản này.');
  return r;
}));

app.get(`${BASE}/api/bc/chi-phi-khoan-muc`, guard, doc('xem_chi_phi_theo_khoan_muc', (req) =>
  bc.chiPhiTheoKhoanMuc({ period: req.query.ky })));

app.get(`${BASE}/api/bc/dau-ky`, guard, async () => bc.trangThaiDauKy());

/* ── Giao diện ─────────────────────────────────────────────────────────── */



app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: `${BASE}/`,
  index: ['index.html'],
  cacheControl: false,
});

app.get(`${BASE}/healthz`, async () => {
  await db.query('select 1');
  return { ok: true, dich_vu: 'finance-vault' };
});

/* ── Khởi động ─────────────────────────────────────────────────────────── */

app.setErrorHandler((err, req, reply) => {
  // Không bao giờ để chi tiết lỗi database lọt ra ngoài: thông điệp lỗi của
  // Postgres có tên bảng, tên cột, đôi khi cả giá trị.
  req.log.error({ err }, 'loi khong bat duoc');
  const code = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  reply.code(code).send({ loi: code === 500 ? 'Có lỗi ở máy chủ. Sự việc đã được ghi lại.' : err.message });
});

async function main() {
  // Kiểm tra cấu hình ngay lúc khởi động chứ không đợi request đầu tiên.
  auth.sign({ sub: 'kiem-tra' }, 1);
  await db.query('select 1');
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`Finance Vault chay tai ${BASE} tren cong ${PORT}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[finance] khong khoi dong duoc:', err.message);
    process.exit(1);
  });
}

module.exports = { app, main, sha256, timingSafeEqual };
