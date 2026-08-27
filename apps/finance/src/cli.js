'use strict';
/**
 * Công cụ quản trị Finance Vault, chạy từ dòng lệnh trên máy chủ.
 *
 * Có mặt vì tài khoản đầu tiên không thể tạo qua giao diện: chưa ai đăng nhập
 * được thì chưa ai tạo được ai. Mật khẩu tạm do máy sinh, in đúng một lần, và
 * người nhận bị bắt đổi ngay lần đăng nhập đầu.
 *
 *   node src/cli.js tao-tai-khoan KeToan "Nguyen Van A" vault_admin
 *   node src/cli.js dat-lai-mat-khau KeToan
 *   node src/cli.js danh-sach
 *   node src/cli.js mo-khoa KeToan
 */
const { randomBytes } = require('node:crypto');
const db = require('./db');
const auth = require('./auth');

/** Mật khẩu tạm phải qua được chính bộ lọc mà người dùng phải qua. */
function matKhauTam() {
  for (let i = 0; i < 50; i += 1) {
    const p = randomBytes(15).toString('base64')
      .replace(/[^A-Za-z0-9]/g, '').slice(0, 14) + 'Aa9#';
    if (auth.passwordProblems(p).length === 0) return p;
  }
  throw new Error('Không sinh được mật khẩu tạm hợp lệ.');
}

const VAI_TRO = ['accountant', 'viewer', 'vault_admin'];

async function taoTaiKhoan(username, fullName, role = 'accountant') {
  if (!username || !fullName) throw new Error('Cú pháp: tao-tai-khoan <ten> "<ho ten>" [vai_tro]');
  if (!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(username)) {
    throw new Error('Tên tài khoản 3 đến 32 ký tự, bắt đầu bằng chữ.');
  }
  if (!VAI_TRO.includes(role)) throw new Error(`Vai trò phải là một trong: ${VAI_TRO.join(', ')}`);

  const tam = matKhauTam();
  const r = await db.one(
    `insert into finance.users(username, password_hash, full_name, role, must_change_password)
     values ($1, $2, $3, $4, true)
     on conflict (username) do nothing
     returning id::text, username, full_name, role`,
    [username, await auth.hashPassword(tam), fullName, role],
  );
  if (!r) throw new Error(`Tài khoản ${username} đã tồn tại. Muốn đặt lại mật khẩu thì dùng dat-lai-mat-khau.`);

  await db.audit({ actor: 'cli', action: 'tao_tai_khoan', target: username, filters: { vai_tro: role } });
  inMatKhau(r.username, r.role, tam);
}

async function datLaiMatKhau(username) {
  if (!username) throw new Error('Cú pháp: dat-lai-mat-khau <ten>');
  const tam = matKhauTam();
  const r = await db.one(
    `update finance.users
        set password_hash = $2, must_change_password = true,
            failed_attempts = 0, locked_until = null, password_changed_at = now()
      where lower(username) = lower($1)
      returning username, role`,
    [username, await auth.hashPassword(tam)],
  );
  if (!r) throw new Error(`Không có tài khoản ${username}.`);
  await db.query(
    `update finance.sessions set revoked_at = now()
      where user_id = (select id from finance.users where lower(username) = lower($1))
        and revoked_at is null`, [username],
  );
  await db.audit({ actor: 'cli', action: 'dat_lai_mat_khau', target: r.username });
  inMatKhau(r.username, r.role, tam);
}

async function moKhoa(username) {
  const r = await db.one(
    `update finance.users set failed_attempts = 0, locked_until = null
      where lower(username) = lower($1) returning username`, [username],
  );
  if (!r) throw new Error(`Không có tài khoản ${username}.`);
  await db.audit({ actor: 'cli', action: 'mo_khoa_tai_khoan', target: r.username });
  console.log(`Đã mở khóa ${r.username}.`);
}

async function danhSach() {
  const rows = await db.rows(
    `select username, full_name, role, is_active, must_change_password,
            failed_attempts, locked_until, last_login_at
     from finance.users order by username`,
  );
  if (!rows.length) {
    console.log('Chưa có tài khoản nào. Tạo tài khoản đầu tiên bằng: tao-tai-khoan');
    return;
  }
  for (const u of rows) {
    const co = [];
    if (!u.is_active) co.push('ĐÃ KHÓA');
    if (u.must_change_password) co.push('phải đổi mật khẩu');
    if (u.locked_until && new Date(u.locked_until) > new Date()) co.push('đang tạm khóa');
    console.log(
      `${u.username.padEnd(16)} ${String(u.role).padEnd(12)} ${(u.full_name || '').padEnd(24)}` +
      ` ${u.last_login_at ? new Date(u.last_login_at).toISOString().slice(0, 16).replace('T', ' ') : 'chưa đăng nhập'}` +
      (co.length ? `  [${co.join(', ')}]` : ''),
    );
  }
}

function inMatKhau(username, role, matKhau) {
  const vach = '═'.repeat(66);
  console.log(`\n${vach}`);
  console.log(`  Tài khoản : ${username}`);
  console.log(`  Vai trò   : ${role}`);
  console.log(`  Mật khẩu  : ${matKhau}`);
  console.log(vach);
  console.log('  Mật khẩu này CHỈ HIỆN MỘT LẦN. Không có cách nào xem lại.');
  console.log('  Gửi cho người dùng qua kênh riêng, đừng gửi qua chat nhóm.');
  console.log('  Lần đăng nhập đầu hệ thống sẽ bắt đổi mật khẩu ngay.');
  console.log(`${vach}\n`);
}

const LENH = {
  'tao-tai-khoan': taoTaiKhoan,
  'dat-lai-mat-khau': datLaiMatKhau,
  'mo-khoa': moKhoa,
  'danh-sach': danhSach,
};

async function main() {
  const [lenh, ...args] = process.argv.slice(2);
  const fn = LENH[lenh];
  if (!fn) {
    console.log('Các lệnh có sẵn:');
    console.log('  tao-tai-khoan <ten> "<ho ten>" [accountant|viewer|vault_admin]');
    console.log('  dat-lai-mat-khau <ten>');
    console.log('  mo-khoa <ten>');
    console.log('  danh-sach');
    process.exit(lenh ? 1 : 0);
  }
  await fn(...args);
}

main()
  .then(() => db.pool.end())
  .catch(async (err) => {
    console.error(`Lỗi: ${err.message}`);
    await db.pool.end().catch(() => {});
    process.exit(1);
  });
