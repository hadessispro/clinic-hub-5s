'use strict';
/**
 * Kết nối database của Finance Vault.
 *
 * Dùng tài khoản finance_app, KHÔNG dùng chung tài khoản với backend vận hành.
 * Tài khoản đó không có quyền trên app và marketing: nó chỉ nhìn thấy phần
 * vận hành qua các view trong finance_src, và mỗi view chỉ phơi đúng cột cần.
 *
 * Mọi lần đọc số tiền đều để lại vết trong finance.access_log. Bảng đó chỉ
 * thêm được, trigger ở database chặn update và delete, kể cả từ chính dịch vụ
 * này. Rò rỉ nội bộ vẫn truy được ra người.
 */
const { Pool } = require('pg');

function connectionString() {
  const url = process.env.FINANCE_DATABASE_URL;
  if (!url) throw new Error('FINANCE_DATABASE_URL chưa được đặt.');
  if (/\/\/clinic_app:/.test(url)) {
    // Chạy két tiền bằng superuser thì mọi lớp phân quyền bên dưới vô nghĩa.
    throw new Error('FINANCE_DATABASE_URL đang trỏ vào clinic_app. Phải dùng finance_app.');
  }
  return url;
}

const pool = new Pool({
  connectionString: connectionString(),
  max: Number(process.env.FINANCE_DB_POOL || 6),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'finance-vault',
});

pool.on('error', (err) => {
  console.error('[finance] lỗi kết nối nhàn rỗi:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function rows(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

/** Chạy nhiều lệnh trong một giao dịch. Lỗi thì hoàn tác trọn vẹn. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    try { await client.query('rollback'); } catch { /* mất kết nối thì thôi */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Người dùng tự sửa hồ sơ của chính mình.
 *
 * Đặt biến phiên finance.self_edit để trigger guard_self_escalation ở database
 * biết đây là hành động tự sửa và chặn tự nâng quyền. Chặn ở database chứ
 * không chỉ ẩn nút trên giao diện: người biết gọi API thẳng vẫn không qua được.
 */
async function asSelf(userId, fn) {
  return tx(async (client) => {
    await client.query("select set_config('finance.self_edit', $1, true)", [userId]);
    return fn(client);
  });
}

/** Ghi vết một lần đọc hoặc một thao tác. Không bao giờ làm hỏng request chính. */
async function audit({ actor, actorRole, action, target, filters, rowCount, ip }) {
  try {
    await pool.query(
      `insert into finance.access_log(actor, actor_role, action, target, filters, row_count, ip)
       values ($1, $2, $3, $4, coalesce($5, '{}'::jsonb), $6, $7)`,
      [actor, actorRole || null, action, target || null,
       filters ? JSON.stringify(filters) : null,
       Number.isFinite(rowCount) ? rowCount : null,
       ip || null],
    );
  } catch (err) {
    console.error('[finance] không ghi được nhật ký truy cập:', err.message);
  }
}

module.exports = { pool, query, rows, one, tx, asSelf, audit };
