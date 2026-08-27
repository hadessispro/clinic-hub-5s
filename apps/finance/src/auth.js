'use strict';
/**
 * Xác thực riêng cho Finance Vault.
 *
 * Cố ý KHÔNG dùng chung khóa với backend vận hành. Token lấy được từ phần khác
 * của hệ thống không gọi được API tài chính, và ngược lại.
 *
 * Hạn token 10 phút thay vì 15 như bên vận hành: két tiền thì phiên phải ngắn.
 */
const { createHmac, randomBytes, randomUUID, scrypt: scryptCb, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCb);

const ACCESS_TTL = Number(process.env.FINANCE_ACCESS_TTL || 600);      // 10 phút
const REFRESH_TTL = Number(process.env.FINANCE_REFRESH_TTL || 43200);  // 12 giờ
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function secret() {
  const s = process.env.FINANCE_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('FINANCE_JWT_SECRET chưa đặt hoặc ngắn hơn 32 ký tự.');
  }
  return s;
}

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function sign(payload, ttl) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  // aud riêng: token của hệ vận hành không bao giờ khớp
  const body = b64({ ...payload, aud: 'finance-vault', iat: now, exp: now + ttl });
  const sig = createHmac('sha256', secret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Phiên đăng nhập không hợp lệ.');
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret()).update(`${header}.${body}`).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Chữ ký phiên không hợp lệ.');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.aud !== 'finance-vault') throw new Error('Token không dành cho phân hệ tài chính.');
  if (payload.exp * 1000 < Date.now()) throw new Error('Phiên đã hết hạn. Đăng nhập lại.');
  return payload;
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [scheme, salt, hex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Mật khẩu yếu là rủi ro lớn nhất của két tiền. Ràng buộc ngay tại đây. */
function passwordProblems(password) {
  const p = String(password || '');
  const bad = [];
  if (p.length < 12) bad.push('phải từ 12 ký tự trở lên');
  if (!/[a-z]/.test(p)) bad.push('cần chữ thường');
  if (!/[A-Z]/.test(p)) bad.push('cần chữ hoa');
  if (!/[0-9]/.test(p)) bad.push('cần chữ số');
  if (!/[^A-Za-z0-9]/.test(p)) bad.push('cần ký tự đặc biệt');
  const weak = ['ketoan', 'password', 'matkhau', '123456', 'admin', 'finance', 'clinic', '5ssaigon'];
  if (weak.some((w) => p.toLowerCase().includes(w))) {
    bad.push('không được chứa từ dễ đoán như ketoan, admin, password');
  }
  return bad;
}

module.exports = {
  ACCESS_TTL, REFRESH_TTL, MAX_FAILED, LOCK_MINUTES,
  sign, verify, hashPassword, checkPassword, passwordProblems, randomUUID,
};
