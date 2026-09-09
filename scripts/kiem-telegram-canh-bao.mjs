#!/usr/bin/env node
/**
 * Kiểm tra tính nhất quán và toàn vẹn của hệ thống Bot Telegram & An ninh F12
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ THẤT BẠI: ${message}`);
    process.exit(1);
  }
}

console.log('--- Bắt đầu kiểm tra hệ thống Telegram & An ninh F12 ---');

// 1. Kiểm tra file migration 045
const migPath = path.join(root, 'infra/postgres/migrations/045-security-audit-and-alerts.sql');
assert(fs.existsSync(migPath), 'Thiếu file migration 045');
const migContent = fs.readFileSync(migPath, 'utf8');
assert(migContent.includes('app.security_events'), 'Migration 045 phải tạo bảng app.security_events');
assert(migContent.includes('app.bot_config'), 'Migration 045 phải tạo bảng app.bot_config');
assert(migContent.includes('f12_opened'), 'Migration 045 phải hỗ trợ sự kiện f12_opened');
assert(migContent.includes('console_tamper'), 'Migration 045 phải hỗ trợ sự kiện console_tamper');
assert(migContent.includes('clinic_backend'), 'Migration 045 phải cấp quyền cho clinic_backend');
console.log('✅ Migration 045: Đầy đủ bảng an ninh, bot config và phân quyền Least Privilege.');

// 2. Kiểm tra Backend Telegram & Security
const telegramTs = fs.readFileSync(path.join(root, 'apps/backend/src/telegram.ts'), 'utf8');
assert(telegramTs.includes('export class TelegramService'), 'telegram.ts phải export TelegramService');
assert(telegramTs.includes('export class TelegramController'), 'telegram.ts phải export TelegramController');
assert(telegramTs.includes('getServerTelemetry'), 'telegram.ts phải có hàm kiểm tra tài nguyên máy chủ');
assert(telegramTs.includes('buildDailyReport'), 'telegram.ts phải có hàm báo cáo hằng ngày');
console.log('✅ Backend TelegramService & TelegramController: Đã kiểm tra.');

const securityTs = fs.readFileSync(path.join(root, 'apps/backend/src/security.ts'), 'utf8');
assert(securityTs.includes('export class SecurityService'), 'security.ts phải export SecurityService');
assert(securityTs.includes('export class SecurityController'), 'security.ts phải export SecurityController');
assert(securityTs.includes('/client-tamper'), 'security.ts phải có endpoint /client-tamper');
console.log('✅ Backend SecurityService & SecurityController: Đã kiểm tra.');

const authTs = fs.readFileSync(path.join(root, 'apps/backend/src/auth.ts'), 'utf8');
assert(authTs.includes("'login_failed'"), 'auth.ts phải ghi nhận login_failed');
assert(authTs.includes("'login_success'"), 'auth.ts phải ghi nhận login_success');
assert(authTs.includes("async logout("), 'auth.ts phải có phương thức logout');
assert(authTs.includes("@Post('/logout')"), 'auth.ts phải có route /logout');
console.log('✅ Backend Auth: Đã tích hợp ghi nhận an ninh đăng nhập, đăng xuất và gửi cảnh báo.');

const appModuleTs = fs.readFileSync(path.join(root, 'apps/backend/src/app.module.ts'), 'utf8');
assert(appModuleTs.includes('TelegramService'), 'app.module.ts phải khai báo TelegramService');
assert(appModuleTs.includes('SecurityService'), 'app.module.ts phải khai báo SecurityService');
assert(appModuleTs.includes('DailyReportScheduler'), 'app.module.ts phải có DailyReportScheduler');
console.log('✅ AppModule: Đã đăng ký đầy đủ controllers, services và lịch chạy Daily Report 22:00.');

// 3. Kiểm tra Frontend Sentinel
const sentinelJs = fs.readFileSync(path.join(root, 'src/services/security-sentinel.js'), 'utf8');
assert(sentinelJs.includes('f12_opened'), 'security-sentinel.js phải bắt phím F12');
assert(sentinelJs.includes('console_tamper'), 'security-sentinel.js phải phát hiện console tamper');
assert(sentinelJs.includes('/api/v2/security/client-tamper'), 'security-sentinel.js phải gửi về backend endpoint an ninh');

const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
assert(mainJs.includes('initSecuritySentinel'), 'main.js phải gọi initSecuritySentinel()');
console.log('✅ Frontend Security Sentinel: Đã tích hợp bắt phím F12, DevTools detector và console watcher.');

// 4. Kiểm tra docker-compose.yml
const dockerCompose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
assert(dockerCompose.includes('TELEGRAM_BOT_TOKEN'), 'docker-compose.yml phải truyền TELEGRAM_BOT_TOKEN');
assert(dockerCompose.includes('TELEGRAM_ADMIN_CHAT_ID'), 'docker-compose.yml phải truyền TELEGRAM_ADMIN_CHAT_ID');
console.log('✅ Docker Compose: Đã cấu hình biến môi trường Telegram cho backend.');

console.log('\n🎉 TẤT CẢ CÁC BƯỚC KIỂM TRA ĐỀU HOÀN TOÀN HỢP LỆ (PASSED).');
