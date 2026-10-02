import * as os from 'node:os';
import * as fs from 'node:fs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, any>;

export interface SecurityAlertPayload {
  eventId?: string | number;
  eventType:
    | 'login_success'
    | 'login_failed'
    | 'logout'
    | 'login_anomaly'
    | 'f12_opened'
    | 'console_tamper'
    | 'gps_anomaly'
    | 'suspicious_activity'
    | 'server_alert'
    | 'change_role'
    | 'lock_account'
    | 'delete_employee'
    | 'bulk_media_access';
  severity: 'info' | 'warning' | 'critical';
  actorCode?: string;
  actorName?: string;
  actorRole?: string;
  branchId?: string;
  clientIp?: string;
  userAgent?: string;
  details?: JsonMap;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  // ponytail: in-memory cache up to 100 rules with 5-min TTL; upgrade to Redis pub/sub if multi-instance
  private rulesCache: Map<string, boolean> = new Map();
  private rulesCacheExpiresAt = 0;
  private pendingGeminiRequests = new Map<string, JsonMap>();
  private geminiKeyIndex = 0;
  private geminiUsageStats = {
    date: new Date().toISOString().slice(0, 10),
    totalToday: 0,
    successAi: 0,
    fallback: 0,
    rateLimitSwitches: 0,
  };

  constructor(private readonly infrastructure: InfrastructureService) {}

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private roleLabel(role?: string): string {
    const labels: Record<string, string> = {
      superadmin: 'Quản trị cấp cao', admin: 'Quản trị viên', admin_it: 'Quản trị IT',
      hr: 'Nhân sự', leader: 'Quản lý', doctor: 'Bác sĩ', bac_si: 'Bác sĩ',
      assistant: 'Phụ tá', phu_ta: 'Phụ tá', phu_ta_truong: 'Trưởng bộ phận Phụ tá',
      receptionist: 'Lễ tân', le_tan: 'Lễ tân', customer_service: 'Chăm sóc khách hàng',
      cham_soc_khach_hang: 'Chăm sóc khách hàng',
      admin_marketing: 'Quản trị Marketing', support_marketing: 'Hỗ trợ Marketing',
      telesale_leader: 'Trưởng nhóm Telesale', telesale_staff: 'Nhân viên Telesale',
      pg_staff: 'Nhân viên PG', staff: 'Nhân viên',
    };
    const key = String(role || '').trim().toLowerCase();
    return labels[key] || role || 'Chưa xác định';
  }

  private branchLabel(branchId?: string): string {
    const key = String(branchId || '').trim().toLowerCase();
    if (!key || key === 'all') return 'Toàn hệ thống';
    if (['pvc', 'pham_van_chieu', 'pham-van-chieu', '5s_pham_van_chieu'].includes(key)) return '5S Phạm Văn Chiêu (PVC)';
    if (['lvt', 'le_van_tho', 'le-van-tho', '5s_le_van_tho'].includes(key)) return '5S Lê Văn Thọ (LVT)';
    return String(branchId);
  }

  private departmentLabel(department?: string): string {
    const labels: Record<string, string> = {
      bs: 'Bác sĩ / Chuyên môn', phuta: 'Phụ tá', dvkh: 'Dịch vụ khách hàng',
      le_tan: 'Lễ tân', letan: 'Lễ tân', hcns: 'Hành chính – Nhân sự',
      marketing: 'Marketing', telesale: 'Telesale', it: 'Công nghệ thông tin',
    };
    const key = String(department || '').trim().toLowerCase();
    return labels[key] || department || 'Chưa cập nhật';
  }

  private deviceSummary(userAgent?: string): { device: string; operatingSystem: string; browser: string } {
    const ua = String(userAgent || '').trim();
    if (!ua) return { device: 'Không xác định', operatingSystem: 'Không xác định', browser: 'Không xác định' };

    let operatingSystem = 'Hệ điều hành khác';
    const android = ua.match(/Android\s+([\d.]+)/i);
    const ios = ua.match(/(?:iPhone OS|CPU OS)\s+([\d_]+)/i);
    const windows = ua.match(/Windows NT\s+([\d.]+)/i);
    const mac = ua.match(/Mac OS X\s+([\d_]+)/i);
    if (android) operatingSystem = `Android ${android[1]}`;
    else if (ios) operatingSystem = `iOS ${ios[1].replace(/_/g, '.')}`;
    else if (windows) operatingSystem = `Windows ${windows[1] === '10.0' ? '10/11' : windows[1]}`;
    else if (mac) operatingSystem = `macOS ${mac[1].replace(/_/g, '.')}`;
    else if (/Linux/i.test(ua)) operatingSystem = 'Linux';

    let browser = 'Trình duyệt khác';
    const edge = ua.match(/Edg(?:A|iOS)?\/([\d.]+)/i);
    const chrome = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/i);
    const firefox = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/i);
    const safari = ua.match(/Version\/([\d.]+).*Safari/i);
    if (edge) browser = `Microsoft Edge ${edge[1].split('.')[0]}`;
    else if (chrome) browser = `Google Chrome ${chrome[1].split('.')[0]}`;
    else if (firefox) browser = `Firefox ${firefox[1].split('.')[0]}`;
    else if (safari) browser = `Safari ${safari[1].split('.')[0]}`;

    let device = /iPad|Tablet/i.test(ua) ? 'Máy tính bảng'
      : /Mobi|Android|iPhone/i.test(ua) ? 'Điện thoại' : 'Máy tính';
    if (/iPhone/i.test(ua)) device = 'iPhone';
    else if (/iPad/i.test(ua)) device = 'iPad';
    else {
      const androidModel = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i)?.[1]?.trim();
      if (androidModel && !/^[a-z]{2}(?:[-_][a-z]{2})?$/i.test(androidModel)) {
        device = `Điện thoại Android (${androidModel})`;
      }
    }
    return { device, operatingSystem, browser };
  }

  private get botToken(): string {
    return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  }

  private async getAdminChatIds(): Promise<string[]> {
    const list = new Set<string>();
    const envChatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();
    if (envChatId) {
      for (const id of envChatId.split(',')) {
        const trimmed = id.trim();
        if (trimmed) list.add(trimmed);
      }
    }

    try {
      const rows = await this.infrastructure.postgres.query<{ config_value: string }>(
        `select config_value from app.bot_config where config_key like 'admin_chat_id:%' or config_key = 'admin_chat_id'`,
      );
      for (const row of rows.rows) {
        const val = String(row.config_value || '').trim();
        let id = val;
        try {
          const parsed = JSON.parse(val);
          if (parsed?.chatId) id = String(parsed.chatId).trim();
        } catch {
          // not JSON
        }
        if (id && /^-?\d+$/.test(id)) list.add(id);
      }
    } catch {
      // Table might not be migrated yet or connection issue
    }

    return [...list];
  }

  async registerAdminChatId(chatId: string | number, name = 'Admin'): Promise<void> {
    const idStr = String(chatId).trim();
    if (!idStr) return;
    try {
      await this.infrastructure.postgres.query(
        `insert into app.bot_config (config_key, config_value, updated_at)
         values ($1, $2, now())
         on conflict (config_key) do update set config_value=excluded.config_value, updated_at=now()`,
        [`admin_chat_id:${idStr}`, JSON.stringify({ chatId: idStr, name, addedAt: new Date().toISOString() })],
      );
    } catch (error) {
      this.logger.error(`Failed to register admin chat id: ${idStr}`, error);
    }
  }

  async sendRawMessage(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML',
    replyMarkup?: JsonMap,
  ): Promise<boolean> {
    const token = this.botToken;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not configured; message skipped.');
      return false;
    }

    try {
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Telegram sendMessage failed [${response.status}]: ${err}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error('Error sending telegram message:', error);
      return false;
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    const token = this.botToken;
    if (!token || !callbackQueryId) return false;
    try {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    replyMarkup?: JsonMap,
  ): Promise<boolean> {
    const token = this.botToken;
    if (!token) return false;
    try {
      const payload: any = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (replyMarkup !== undefined) {
        payload.reply_markup = replyMarkup;
      }
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return true;
    } catch {
      return false;
    }
  }

  async broadcast(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<number> {
    const chatIds = await this.getAdminChatIds();
    if (chatIds.length === 0) {
      this.logger.warn('No Telegram admin chat IDs configured to receive alerts.');
      return 0;
    }

    let sent = 0;
    for (const chatId of chatIds) {
      const ok = await this.sendRawMessage(chatId, text, parseMode);
      if (ok) sent += 1;
    }
    return sent;
  }

  async shouldNotify(actionType: string, defaultAllow = false): Promise<boolean> {
    const now = Date.now();
    if (this.rulesCacheExpiresAt > now && this.rulesCache.has(actionType)) {
      return Boolean(this.rulesCache.get(actionType));
    }

    try {
      const res = await this.infrastructure.postgres.query<{ action_type: string; should_notify: boolean }>(
        `select action_type, should_notify from app.notification_rules`,
      );
      this.rulesCache.clear();
      for (const row of res.rows) {
        this.rulesCache.set(row.action_type, Boolean(row.should_notify));
      }
      this.rulesCacheExpiresAt = now + 5 * 60 * 1000;
      if (this.rulesCache.has(actionType)) {
        return Boolean(this.rulesCache.get(actionType));
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch notification_rules for ${actionType}: ${e}`);
    }

    return defaultAllow;
  }

  invalidateRulesCache(): void {
    this.rulesCache.clear();
    this.rulesCacheExpiresAt = 0;
  }

  async getNotificationRules(): Promise<any[]> {
    const res = await this.infrastructure.postgres.query(
      `select action_type, category, severity, should_notify, description, updated_at
       from app.notification_rules
       order by category, action_type`,
    );
    return res.rows;
  }

  async updateNotificationRule(actionType: string, shouldNotify: boolean): Promise<any> {
    const res = await this.infrastructure.postgres.query(
      `update app.notification_rules
       set should_notify = $2, updated_at = now()
       where action_type = $1
       returning action_type, category, severity, should_notify, description, updated_at`,
      [actionType, Boolean(shouldNotify)],
    );
    this.invalidateRulesCache();
    return res.rows[0];
  }

  async sendSecurityAlert(alert: SecurityAlertPayload): Promise<void> {
    // Không gửi Telegram các sự kiện F12, DevTools, Console hoặc đăng nhập/đăng xuất thông thường để tránh spam
    if (['f12_opened', 'devtools_opened', 'console_tamper', 'login_success', 'logout'].includes(alert.eventType)) {
      return;
    }
    const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    const severityLabel = alert.severity === 'critical' ? 'NGHIÊM TRỌNG' : alert.severity === 'warning' ? 'CẢNH BÁO' : 'THÔNG TIN';

    let eventTitle = 'Sự kiện an ninh';
    if (alert.eventType === 'f12_opened') eventTitle = 'PHÁT HIỆN MỞ F12 / DEVTOOLS';
    else if (alert.eventType === 'console_tamper') eventTitle = 'CAN THIỆP MÃ NGUỒN TRỰC TIẾP TRÊN CONSOLE';
    else if (alert.eventType === 'login_failed') eventTitle = 'ĐĂNG NHẬP THẤT BẠI NHIỀU LẦN';
    else if (alert.eventType === 'login_anomaly') eventTitle = 'CẢNH BÁO ĐĂNG NHẬP BẤT THƯỜNG';
    else if (alert.eventType === 'login_success') eventTitle = 'ĐĂNG NHẬP HỆ THỐNG';
    else if (alert.eventType === 'delete_employee') eventTitle = 'XÓA NHÂN SỰ RA KHỎI HỆ THỐNG';
    else if (alert.eventType === 'logout') eventTitle = 'ĐĂNG XUẤT HỆ THỐNG';
    else if (alert.eventType === 'gps_anomaly') eventTitle = 'CHẤM CÔNG GPS BẤT THƯỜNG';
    else if (alert.eventType === 'change_role') eventTitle = 'THAY ĐỔI VAI TRÒ / QUYỀN HẠN TÀI KHOẢN';
    else if (alert.eventType === 'lock_account') eventTitle = 'KHÓA TÀI KHOẢN NHÂN SỰ';
    else if (alert.eventType === 'bulk_media_access') eventTitle = 'CẢNH BÁO TRUY XUẤT ẢNH HÀNG LOẠT';
    else if (alert.eventType === 'server_alert') eventTitle = 'CẢNH BÁO TÀI NGUYÊN MÁY CHỦ';

    const timeStr = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());

    const device = this.deviceSummary(alert.userAgent);
    const actorName = this.escapeHtml(alert.actorName || 'Chưa xác định');
    const actorCode = this.escapeHtml(alert.actorCode || 'Chưa có mã');
    const department = this.escapeHtml(this.departmentLabel(alert.details?.phongBan || alert.details?.department));
    const selectedBranch = alert.details?.chiNhanhDaChon
      ? this.branchLabel(String(alert.details.chiNhanhDaChon)) : '';
    const note = this.escapeHtml(alert.details?.thongBao || alert.details?.canhBao || '');

    const message = [
      `${icon} <b>${eventTitle}</b> [${severityLabel}]`,
      `━━━━━━━━━━━━━━━━━━━━`,
      alert.eventId ? `🧾 <b>Mã nhật ký:</b> <code>#${this.escapeHtml(alert.eventId)}</code>` : '',
      `👤 <b>Người thực hiện:</b> ${actorName}`,
      `🪪 <b>Mã nhân sự:</b> <code>${actorCode}</code>`,
      `💼 <b>Chức danh / quyền:</b> ${this.escapeHtml(this.roleLabel(alert.actorRole))}`,
      `🏷️ <b>Phòng ban:</b> ${department}`,
      `🏢 <b>Chi nhánh hồ sơ:</b> ${this.escapeHtml(this.branchLabel(alert.branchId))}`,
      selectedBranch ? `📍 <b>Phạm vi đã chọn:</b> ${this.escapeHtml(selectedBranch)}` : '',
      `🌐 <b>Địa chỉ IP:</b> <code>${this.escapeHtml(alert.clientIp || 'Không xác định')}</code>`,
      `📱 <b>Thiết bị:</b> ${this.escapeHtml(device.device)}`,
      `💻 <b>Hệ điều hành:</b> ${this.escapeHtml(device.operatingSystem)}`,
      `🌍 <b>Trình duyệt:</b> ${this.escapeHtml(device.browser)}`,
      `🕒 <b>Thời gian:</b> ${timeStr}`,
      note ? `📝 <b>Ghi chú:</b> ${note}` : '',
    ].filter(Boolean).join('\n');

    await this.broadcast(message, 'HTML');
  }

  async getServerTelemetry(): Promise<JsonMap> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = ((usedMem / totalMem) * 100).toFixed(1);

    const loadAvg = os.loadavg().map((n) => n.toFixed(2));
    const uptimeHours = (os.uptime() / 3600).toFixed(1);

    // Database check
    let dbStatus = 'Chưa kết nối';
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      const dbRes = await this.infrastructure.postgres.query('select count(*) from app.records where deleted_at is null');
      dbLatency = Date.now() - dbStart;
      dbStatus = `Sẵn sàng (${dbRes.rows[0].count} bản ghi, ${dbLatency}ms)`;
    } catch (e: any) {
      dbStatus = `LỖI: ${e?.message || e}`;
    }

    // Redis check
    let redisStatus = 'Chưa kết nối';
    try {
      const rStart = Date.now();
      const pong = await this.infrastructure.redis.ping();
      const rLatency = Date.now() - rStart;
      redisStatus = `${pong} (${rLatency}ms)`;
    } catch (e: any) {
      redisStatus = `LỖI: ${e?.message || e}`;
    }

    // Disk space check if statfs is supported
    let diskInfo = 'N/A';
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync('/');
        const totalDisk = stats.blocks * stats.bsize;
        const freeDisk = stats.bfree * stats.bsize;
        const usedDisk = totalDisk - freeDisk;
        const diskUsagePct = ((usedDisk / totalDisk) * 100).toFixed(1);
        diskInfo = `${(usedDisk / (1024 ** 3)).toFixed(1)}GB / ${(totalDisk / (1024 ** 3)).toFixed(1)}GB (${diskUsagePct}%)`;
      }
    } catch {
      diskInfo = 'N/A';
    }

    return {
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.arch()}`,
      uptimeHours,
      loadAvg: loadAvg.join(', '),
      ram: `${(usedMem / (1024 ** 2)).toFixed(0)}MB / ${(totalMem / (1024 ** 2)).toFixed(0)}MB (${memUsagePct}%)`,
      disk: diskInfo,
      database: dbStatus,
      redis: redisStatus,
    };
  }

  async buildStatusMessage(): Promise<string> {
    const stats = await this.getServerTelemetry();
    return [
      `💻 <b>TÌNH TRẠNG MÁY CHỦ CLINIC HUB 5S</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🖥️ <b>Máy chủ:</b> <code>${stats.hostname}</code> (${stats.platform})`,
      `⏱️ <b>Thời gian hoạt động:</b> ${stats.uptimeHours} giờ`,
      `📊 <b>CPU Load (1/5/15m):</b> <code>${stats.loadAvg}</code>`,
      `🧠 <b>Bộ nhớ RAM:</b> <code>${stats.ram}</code>`,
      `💾 <b>Dung lượng Ổ cứng:</b> <code>${stats.disk}</code>`,
      `🗄️ <b>PostgreSQL 17:</b> ${stats.database}`,
      `⚡ <b>Redis 8 Cache:</b> ${stats.redis}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ <i>Trạng thái tổng quan: Đang hoạt động bình thường</i>`,
    ].join('\n');
  }

  async buildDailyReport(): Promise<string> {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    let attendanceStats = 'Chưa có dữ liệu';
    let securitySummary = 'Không có cảnh báo bất thường';
    let proposalsCount = 0;

    try {
      // 1. Attendance today
      const attRes = await this.infrastructure.postgres.query<{ branch: string; count: string }>(
        `select coalesce(payload->>'branch_id', 'Chưa rõ') as branch, count(*) as count
         from app.records
         where entity_type='attendance_records' and deleted_at is null
           and (payload->>'work_date'=$1 or payload->>'date'=$1)
         group by 1`,
        [today],
      );
      if (attRes.rows.length > 0) {
        attendanceStats = attRes.rows.map((r) => `  • <b>${r.branch}:</b> ${r.count} lượt điểm danh`).join('\n');
      } else {
        attendanceStats = '  • Chưa có lượt điểm danh hôm nay';
      }

      // 2. Purchase proposals created today
      const propRes = await this.infrastructure.postgres.query<{ count: string }>(
        `select count(*) as count from app.records
         where entity_type='purchase_proposals' and deleted_at is null
           and created_at::date = $1::date`,
        [today],
      );
      proposalsCount = Number(propRes.rows[0]?.count || 0);

      // 3. Security & login events today
      const secRes = await this.infrastructure.postgres.query<{ event_type: string; count: string }>(
        `select event_type, count(*) as count from app.security_events
         where created_at::date = $1::date
         group by event_type`,
        [today],
      );
      if (secRes.rows.length > 0) {
        const secLabels: Record<string, string> = {
          login_success: '🔑 Đăng nhập thành công',
          login_failed: '❌ Đăng nhập thất bại',
          login_anomaly: '⚠️ Đăng nhập ngoài giờ / IP lạ',
          f12_opened: '⚠️ Mở DevTools (F12)',
          console_tamper: '🚨 Can thiệp Console',
          gps_anomaly: '📍 Chấm công GPS bất thường',
          change_role: '🛡️ Đổi vai trò / phân quyền',
          lock_account: '🔒 Khóa tài khoản',
          bulk_media_access: '📦 Tải/xem ảnh hàng loạt',
          server_alert: '💻 Cảnh báo tài nguyên máy chủ',
        };
        securitySummary = secRes.rows
          .map((r) => `  • ${secLabels[r.event_type] || r.event_type}: ${r.count} sự kiện`)
          .join('\n');
      }

      // 4. Clinical media audit today
      let mediaSummary = '  • Chưa có hoạt động kho ảnh hôm nay';
      try {
        const mediaRes = await this.infrastructure.postgres.query<{ action: string; count: string }>(
          `select action, count(*) as count from app.media_audit_log
           where created_at::date = $1::date
           group by action`,
          [today],
        );
        if (mediaRes.rows.length > 0) {
          const actionLabels: Record<string, string> = {
            upload: '📸 Tải lên ảnh lâm sàng mới',
            view: '👁️ Lượt xem / tra cứu ảnh',
            download: '📥 Tải ảnh về máy',
            create_folder: '📁 Tạo thư mục bệnh nhân',
            delete: '🗑️ Xóa tệp ảnh',
            delete_folder: '🗑️ Xóa thư mục bệnh nhân',
            update_note: '📝 Cập nhật ghi chú ảnh',
          };
          mediaSummary = mediaRes.rows
            .map((r) => `  • ${actionLabels[r.action] || r.action}: ${r.count} lượt`)
            .join('\n');
        }
      } catch (err) {
        this.logger.warn(`Failed to aggregate media audit log for daily report: ${err}`);
      }

      const vnDate = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'full',
      }).format(new Date());

      return [
        `📊 <b>BÁO CÁO VẬN HÀNH NGÀY ${today}</b>`,
        `📅 <i>${vnDate}</i>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `⏰ <b>Tình hình Chấm công theo chi nhánh:</b>`,
        attendanceStats,
        ``,
        `📦 <b>Đề xuất mua hàng mới:</b> ${proposalsCount} phiếu`,
        ``,
        `📸 <b>Kho ảnh lâm sàng & Truy cập hôm nay:</b>`,
        mediaSummary,
        ``,
        `🛡️ <b>Tình hình an ninh & kiểm soát:</b>`,
        securitySummary,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🤖 <i>Clinic Hub 5S Automated Security & Operations Sentinel</i>`,
      ].join('\n');
    } catch (e: any) {
      this.logger.error('Error fetching daily report data:', e);
      return `❌ Lỗi tổng hợp báo cáo vận hành ngày ${today}: ${e?.message || e}`;
    }
  }

  async buildBranchUsersMessage(): Promise<string> {
    try {
      const res = await this.infrastructure.postgres.query<{ branch: string; active_count: string; total_count: string }>(
        `select
           coalesce(payload->>'branch_id', 'Chưa phân chi nhánh') as branch,
           count(case when coalesce((payload->>'active')::boolean, true) = true then 1 end) as active_count,
           count(*) as total_count
         from app.records
         where entity_type='employees' and deleted_at is null
         group by 1 order by 1`,
      );

      const lines = res.rows.map((r) => `  • <b>${r.branch}:</b> ${r.active_count} đang làm việc / tổng ${r.total_count} nhân sự`);
      return [
        `👥 <b>THỐNG KÊ NHÂN SỰ THEO CHI NHÁNH</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ...lines,
        `━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');
    } catch (e: any) {
      return `❌ Lỗi khi lấy danh sách chi nhánh: ${e?.message || e}`;
    }
  }

  async buildRecentAlertsMessage(): Promise<string> {
    try {
      const res = await this.infrastructure.postgres.query<{
        event_type: string; severity: string; actor_name: string; actor_code: string; branch_id: string; created_at: Date; details: JsonMap;
      }>(
        `select event_type, severity, actor_name, actor_code, branch_id, created_at, details
         from app.security_events
         order by created_at desc limit 7`,
      );

      if (res.rows.length === 0) {
        return `🛡️ <b>Hệ thống chưa ghi nhận cảnh báo an ninh nào.</b>`;
      }

      const lines = res.rows.map((r) => {
        const icon = r.severity === 'critical' ? '🚨' : r.severity === 'warning' ? '⚠️' : 'ℹ️';
        const time = new Intl.DateTimeFormat('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          timeStyle: 'medium',
          dateStyle: 'short',
        }).format(new Date(r.created_at));
        return `${icon} <b>${r.event_type}</b> [${time}]\n   👤 ${r.actor_name || r.actor_code || 'Ẩn danh'} (${r.branch_id || 'N/A'})\n   📝 <code>${JSON.stringify(r.details)}</code>`;
      });

      return [
        `🛡️ <b>DANH SÁCH 7 CẢNH BÁO AN NINH GẦN NHẤT</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        lines.join('\n\n'),
      ].join('\n');
    } catch (e: any) {
      return `❌ Lỗi khi tải nhật ký cảnh báo: ${e?.message || e}`;
    }
  }

  async handleIncomingMessage(chatId: string | number, text: string, fromUser?: any): Promise<void> {
    const cmd = String(text || '').trim().toLowerCase();

    if (cmd === '/start') {
      const name = [fromUser?.first_name, fromUser?.last_name].filter(Boolean).join(' ') || fromUser?.username || 'Admin';
      await this.registerAdminChatId(chatId, name);
      const welcome = [
        `👋 <b>Chào mừng bạn đến với Bot Giám sát Clinic Hub 5S!</b>`,
        ``,
        `Chat ID của bạn <code>${chatId}</code> đã được đăng ký nhận thông báo an ninh và báo cáo tự động của hệ thống.`,
        ``,
        `📌 <b>Các lệnh điều khiển:</b>`,
        `  • /status - Kiểm tra sức khỏe máy chủ (CPU, RAM, Disk, DB, Redis)`,
        `  • /baocao - Xem báo cáo vận hành & điểm danh trong ngày`,
        `  • /users - Xem phân bố nhân sự theo chi nhánh`,
        `  • /canhbao - Xem các sự kiện an ninh/F12 gần nhất`,
        `  • /help - Xem lại hướng dẫn`,
      ].join('\n');
      await this.sendRawMessage(String(chatId), welcome);
      return;
    }

    if (cmd === '/status' || cmd === '/server') {
      const msg = await this.buildStatusMessage();
      await this.sendRawMessage(String(chatId), msg);
      return;
    }

    if (cmd === '/baocao' || cmd === '/report') {
      const msg = await this.buildDailyReport();
      await this.sendRawMessage(String(chatId), msg);
      return;
    }

    if (cmd === '/users' || cmd === '/chinhanh') {
      const msg = await this.buildBranchUsersMessage();
      await this.sendRawMessage(String(chatId), msg);
      return;
    }

    if (cmd === '/canhbao' || cmd === '/alerts' || cmd === '/security') {
      const msg = await this.buildRecentAlertsMessage();
      await this.sendRawMessage(String(chatId), msg);
      return;
    }

    if (cmd === '/help') {
      const help = [
        `🤖 <b>TRỢ LÝ GIÁM SÁT HỆ THỐNG CLINIC HUB 5S</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🔹 /status : Kiểm tra tài nguyên máy chủ từ xa`,
        `🔹 /baocao : Báo cáo vận hành hôm nay`,
        `🔹 /users : Thống kê nhân sự các chi nhánh`,
        `🔹 /canhbao : Xem nhật ký an ninh & F12 gần đây`,
      ].join('\n');
      await this.sendRawMessage(String(chatId), help);
      return;
    }

    // Default unknown command
    await this.sendRawMessage(String(chatId), `❓ Lệnh không hợp lệ. Hãy gõ /help để xem danh sách lệnh.`);
  }

  async handleCallbackQuery(cq: any): Promise<void> {
    const data = String(cq?.data || '');
    const cqId = String(cq?.id || '');
    const chatId = cq?.message?.chat?.id;
    const messageId = cq?.message?.message_id;
    const approver = [cq?.from?.first_name, cq?.from?.last_name].filter(Boolean).join(' ') || cq?.from?.username || 'Sếp';

    const nowStr = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());

    // Xác thực quyền của người nhấn nút trên Telegram
    const adminChatIds = await this.getAdminChatIds();
    const fromId = String(cq?.from?.id || '');
    const fromChatId = String(chatId || '');
    const isAuthorized = adminChatIds.length === 0 || adminChatIds.includes(fromId) || adminChatIds.includes(fromChatId);
    if (!isAuthorized) {
      await this.answerCallbackQuery(cqId, '⛔ Bạn không có quyền quản trị để thực hiện thao tác này.');
      return;
    }

    if (data.startsWith('gemini_approve:')) {
      const reqId = data.replace('gemini_approve:', '').trim();
      let cachedPayload = this.pendingGeminiRequests.get(reqId);
      if (!cachedPayload) {
        try {
          const row = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
            `select payload from app.records where entity_type='gemini_pending_requests' and record_key=$1 and deleted_at is null limit 1`,
            [reqId],
          );
          if (row.rows[0]?.payload) cachedPayload = row.rows[0].payload;
        } catch {}
      }

      let approvalSuccess = false;
      let approvalError = '';
      if (cachedPayload) {
        try {
          await this.approveGeminiRequest(cachedPayload, `Sếp (${approver})`);
          approvalSuccess = true;
        } catch (err: any) {
          approvalError = err?.message || String(err);
          this.logger.error(`Failed to execute approveGeminiRequest from Telegram: ${approvalError}`);
        }
      }

      await this.answerCallbackQuery(cqId, approvalSuccess ? '✅ Sếp đã phê duyệt thành công!' : '⚠️ Phê duyệt thất bại.');
      if (chatId && messageId) {
        const originalText = String(cq?.message?.text || '');
        const empInfo = cachedPayload?.employeeName ? ` cho <b>${this.escapeHtml(cachedPayload.employeeName)}</b> (<code>${this.escapeHtml(cachedPayload.employeeCode)}</code>)` : '';
        const updatedText = approvalSuccess
          ? `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n✅ <b>ĐÃ PHÊ DUYỆT BỞI SẾP (${this.escapeHtml(approver)})</b>\n⏰ Lúc: ${nowStr}\n<i>Dữ liệu đã tự động cập nhật vào hệ thống Clinic Hub 5S${empInfo}.</i>`
          : `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>LỖI PHÊ DUYỆT BỞI SẾP (${this.escapeHtml(approver)})</b>\n⏰ Lúc: ${nowStr}\n<i>Lỗi: ${this.escapeHtml(approvalError || 'Không tìm thấy dữ liệu yêu cầu.')}</i>`;
        await this.editMessageText(chatId, messageId, updatedText, { inline_keyboard: [] });
      }
    } else if (data.startsWith('gemini_reject:')) {
      await this.answerCallbackQuery(cqId, '❌ Sếp đã từ chối yêu cầu.');
      if (chatId && messageId) {
        const originalText = String(cq?.message?.text || '');
        const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n❌ <b>ĐÃ TỪ CHỐI BỞI SẾP (${this.escapeHtml(approver)})</b>\n⏰ Lúc: ${nowStr}`;
        await this.editMessageText(chatId, messageId, updatedText, { inline_keyboard: [] });
      }
    }
  }

  private async getGeminiRawConfig(): Promise<JsonMap> {
    const defaultKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JU5HAeaWt1evBsfpsapqF4cirPgFgPoNHUgijys_jnFg';
    try {
      const res = await this.infrastructure.postgres.query<{ config_value: string }>(
        `select config_value from app.bot_config where config_key = 'gemini_assistant_config'`,
      );
      if (res.rows.length > 0) {
        return JSON.parse(res.rows[0].config_value || '{}');
      }
    } catch {}
    return { apiKey: defaultKey, apiKeys: [defaultKey], model: 'gemini-3.6-flash', dailyLimit: 1000 };
  }

  async getGeminiConfig(): Promise<JsonMap> {
    const defaultKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JU5HAeaWt1evBsfpsapqF4cirPgFgPoNHUgijys_jnFg';
    const parsed = await this.getGeminiRawConfig();
    const keys: string[] = [];
    if (Array.isArray(parsed.apiKeys)) {
      for (const k of parsed.apiKeys) {
        const trimmed = String(k || '').trim();
        if (trimmed) keys.push(trimmed);
      }
    }
    if (keys.length === 0 && parsed.apiKey) {
      const trimmed = String(parsed.apiKey).trim();
      if (trimmed) keys.push(trimmed);
    }
    if (keys.length === 0 && defaultKey) {
      keys.push(defaultKey);
    }
    const primaryKey = keys[0] || '';
    return {
      apiKeyMasked: primaryKey ? `${primaryKey.slice(0, 6)}...${primaryKey.slice(-4)}` : '',
      apiKeysMasked: keys.map((k) => `${k.slice(0, 6)}...${k.slice(-4)}`),
      apiKeysCount: keys.length,
      activeKeyIndex: this.geminiKeyIndex % Math.max(1, keys.length),
      model: parsed.model || 'gemini-3.6-flash',
      telegramChatId: parsed.telegramChatId || '',
      autoApprove: Boolean(parsed.autoApprove),
      systemPrompt: parsed.systemPrompt || '',
      dailyLimit: Number(parsed.dailyLimit || 1000),
      isConfigured: keys.length > 0,
    };
  }

  async saveGeminiConfig(config: JsonMap): Promise<JsonMap> {
    const defaultKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JU5HAeaWt1evBsfpsapqF4cirPgFgPoNHUgijys_jnFg';
    try {
      const existing = await this.getGeminiRawConfig();
      let existingKeys: string[] = [defaultKey];
      if (Array.isArray(existing.apiKeys) && existing.apiKeys.length > 0) {
        existingKeys = existing.apiKeys;
      } else if (existing.apiKey) {
        existingKeys = [existing.apiKey];
      }

      // Hỗ trợ nhập nhiều key qua apiKeysRaw (mỗi dòng hoặc dấu phẩy) hoặc mảng apiKeys
      const incomingRaw = String(config.apiKeysRaw || config.apiKey || '').trim();
      let updatedKeys: string[] = [];
      if (incomingRaw) {
        const lines = incomingRaw.split(/[\n,;]+/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          if (line.includes('...')) {
            if (existingKeys[i]) updatedKeys.push(existingKeys[i]);
          } else {
            updatedKeys.push(line);
          }
        }
      } else if (Array.isArray(config.apiKeys)) {
        updatedKeys = config.apiKeys.map((k: any) => String(k || '').trim()).filter(Boolean);
      }

      if (updatedKeys.length === 0) updatedKeys = existingKeys;

      const toStore = {
        apiKey: updatedKeys[0] || defaultKey,
        apiKeys: updatedKeys,
        model: (config.model && config.model !== 'gemini-2.5-flash') ? config.model : 'gemini-3.6-flash',
        telegramChatId: String(config.telegramChatId || '').trim(),
        autoApprove: Boolean(config.autoApprove),
        systemPrompt: String(config.systemPrompt || '').trim(),
        dailyLimit: Number(config.dailyLimit || 1000),
        updatedAt: new Date().toISOString(),
      };

      await this.infrastructure.postgres.query(
        `insert into app.bot_config (config_key, config_value, updated_at)
         values ('gemini_assistant_config', $1, now())
         on conflict (config_key) do update set config_value=excluded.config_value, updated_at=now()`,
        [JSON.stringify(toStore)],
      );

      this.geminiKeyIndex = 0; // Đặt lại về key đầu tiên sau khi lưu

      return {
        success: true,
        message: `Đã lưu cấu hình Trợ lý Gemini thành công (${updatedKeys.length} API Key).`,
        config: {
          apiKeyMasked: toStore.apiKey ? `${toStore.apiKey.slice(0, 6)}...${toStore.apiKey.slice(-4)}` : '',
          apiKeysMasked: updatedKeys.map((k) => `${k.slice(0, 6)}...${k.slice(-4)}`),
          apiKeysCount: updatedKeys.length,
          activeKeyIndex: 0,
          model: toStore.model,
          telegramChatId: toStore.telegramChatId,
          autoApprove: toStore.autoApprove,
          dailyLimit: toStore.dailyLimit,
          isConfigured: Boolean(toStore.apiKey),
        },
      };
    } catch (e: any) {
      this.logger.error('Error saving gemini config:', e);
      throw new BadRequestException(`Không thể lưu cấu hình Gemini: ${e?.message || e}`);
    }
  }

  async testGeminiKeys(body?: { apiKeysRaw?: string; model?: string }): Promise<JsonMap> {
    const config = await this.getGeminiRawConfig();
    let keys: string[] = [];

    if (body?.apiKeysRaw && typeof body.apiKeysRaw === 'string') {
      const lines = body.apiKeysRaw.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.includes('...')) {
          keys.push(line);
        }
      }
    }

    if (keys.length === 0) {
      keys = Array.isArray(config.apiKeys) && config.apiKeys.length > 0
        ? config.apiKeys
        : (config.apiKey ? [config.apiKey] : [process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JU5HAeaWt1evBsfpsapqF4cirPgFgPoNHUgijys_jnFg']);
    }

    let testModel = body?.model || config.model || 'gemini-3.6-flash';
    if (testModel === 'gemini-2.5-flash') testModel = 'gemini-3.6-flash';

    if (keys.length === 0) {
      return { success: false, message: 'Chưa cấu hình API Key nào trong hệ thống.' };
    }

    const results = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const start = Date.now();
      const masked = `${key.slice(0, 6)}...${key.slice(-4)}`;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(testModel)}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'hi' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) {
          results.push({ index: i, keyMasked: masked, status: 'healthy', latencyMs, message: `Hoạt động tốt (${testModel})` });
        } else {
          let errDetail = '';
          try {
            const errJson = await res.json();
            errDetail = errJson?.error?.message || '';
          } catch {
            // ignore
          }
          if (res.status === 429) {
            results.push({ index: i, keyMasked: masked, status: 'rate_limited', latencyMs, message: 'Rate Limit (429) - Hết quota' });
          } else if (res.status === 400 || res.status === 401 || res.status === 403) {
            results.push({ index: i, keyMasked: masked, status: 'error', latencyMs, message: errDetail ? `Lỗi (${res.status}): ${errDetail.slice(0, 80)}` : `Key không hợp lệ / Hết hạn (${res.status})` });
          } else if (res.status === 404) {
            results.push({ index: i, keyMasked: masked, status: 'error', latencyMs, message: `Model '${testModel}' không khả dụng (404)` });
          } else {
            results.push({ index: i, keyMasked: masked, status: 'error', latencyMs, message: `Lỗi HTTP ${res.status}${errDetail ? `: ${errDetail.slice(0, 60)}` : ''}` });
          }
        }
      } catch (err: any) {
        results.push({ index: i, keyMasked: masked, status: 'error', latencyMs: Date.now() - start, message: err?.message || 'Lỗi mạng' });
      }
    }
    return { success: true, keys: results, model: testModel };
  }

  private async callGeminiWithFailover(
    keys: string[],
    model: string,
    prompt: string,
    systemInstruction: string,
  ): Promise<{ text: string; usedKeyIndex: number; usedModel: string }> {
    if (!keys || keys.length === 0) throw new Error('Không có API Key trong hệ thống.');
    const maxAttempts = keys.length;
    let lastError: any = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const keyIndex = (this.geminiKeyIndex + attempt) % keys.length;
      const key = keys[keyIndex];
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        });

        if (res.ok) {
          const aiJson = await res.json();
          const partText = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (partText) {
            this.geminiKeyIndex = keyIndex; // Khoá lại vào key đang hoạt động tốt
            return { text: partText, usedKeyIndex: keyIndex, usedModel: model };
          }
        }

        const errText = await res.text();
        this.logger.warn(`Gemini key #${keyIndex + 1} HTTP ${res.status}: ${errText.slice(0, 150)}`);

        if (res.status === 429 || res.status === 403 || errText.includes('RESOURCE_EXHAUSTED')) {
          this.geminiUsageStats.rateLimitSwitches++;
          this.logger.warn(`[Gemini Failover] Key #${keyIndex + 1} bị rate limit / quota. Tự động đổi sang Key tiếp theo...`);
          lastError = new Error(`Key #${keyIndex + 1} bị Rate Limit (429)`);
          continue;
        }

        lastError = new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 100)}`);
      } catch (err: any) {
        this.logger.warn(`Key #${keyIndex + 1} exception: ${err.message}`);
        lastError = err;
      }
    }
    throw lastError || new Error('Tất cả API keys trong pool đều không thể kết nối.');
  }

  async getGeminiActivities(): Promise<JsonMap> {
    const config = await this.getGeminiRawConfig();
    const keys: string[] = Array.isArray(config.apiKeys) && config.apiKeys.length > 0
      ? config.apiKeys
      : (config.apiKey ? [config.apiKey] : []);

    let activities: JsonMap[] = [];
    try {
      const res = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records
         where entity_type = 'gemini_activity_logs' and deleted_at is null
         order by created_at desc limit 60`,
      );
      activities = res.rows.map((r) => r.payload);
    } catch (e) {
      this.logger.warn('Error reading gemini activity logs:', e);
    }

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const todayLogs = activities.filter((a) => String(a.created_at || '').startsWith(today));
    const totalToday = Math.max(this.geminiUsageStats.totalToday, todayLogs.length);
    const successAiCount = todayLogs.filter((a) => a.used_ai).length;
    const fallbackCount = todayLogs.filter((a) => !a.used_ai).length;
    const rateLimitHits = this.geminiUsageStats.rateLimitSwitches;

    return {
      success: true,
      stats: {
        date: today,
        totalToday,
        dailyLimit: Number(config.dailyLimit || 1000),
        successAiCount,
        fallbackCount,
        rateLimitHits,
        activeKeyIndex: this.geminiKeyIndex % Math.max(1, keys.length),
        keysCount: keys.length,
      },
      activities,
    };
  }

  resolveClinicShift(
    rawShiftOrCode: string | undefined | null,
    employeeCode?: string,
    department?: string,
    title?: string,
  ) {
    const codeLower = String(employeeCode || '').toLowerCase();
    const deptLower = String(department || '').toLowerCase();
    const titleLower = String(title || '').toLowerCase();

    const isDoctor = deptLower === 'bs' || deptLower.includes('chuyên môn') || titleLower.includes('bác sĩ') || codeLower.startsWith('bs');
    const isFront = deptLower === 'phuta' || deptLower === 'dvkh' || deptLower.includes('lễ tân') || deptLower.includes('khách hàng') || titleLower.includes('phụ tá') || titleLower.includes('lễ tân') || titleLower.includes('dịch vụ khách hàng') || codeLower.startsWith('pt') || codeLower.startsWith('lt') || codeLower.startsWith('pvc') || codeLower.startsWith('lvt');
    const isSecurity = deptLower === 'baove' || titleLower.includes('bảo vệ') || codeLower.startsWith('bv');
    const isCleaning = deptLower === 'laocong' || titleLower.includes('tạp vụ') || titleLower.includes('lao công');
    const isOffice = deptLower === 'mkt' || deptLower.includes('marketing') || deptLower === 'it' || deptLower === 'ketoan' || deptLower === 'hr' || deptLower === 'nhansu' || titleLower.includes('marketing') || titleLower.includes('kế toán') || titleLower.includes('nhân sự') || titleLower.includes('it');

    const s = String(rawShiftOrCode || '').toLowerCase().trim();

    // 1. Nhóm Bác sĩ
    if (isDoctor) {
      if (s.includes('sáng') || s === 'sang' || s === 's' || s === 'doctor-morning') {
        return { code: 'doctor-morning', name: 'Ca sáng', start: '08:00', end: '18:00', minutes: 540 };
      }
      if (s.includes('chiều') || s === 'chieu' || s === 'c' || s === 'doctor-afternoon') {
        return { code: 'doctor-afternoon', name: 'Ca chiều', start: '10:00', end: '20:00', minutes: 540 };
      }
      if (s.includes('full') || s.includes('cả ngày') || s === 'f' || s === 'doctor-full') {
        return { code: 'doctor-full', name: 'Ca full', start: '08:00', end: '20:00', minutes: 660 };
      }
      return { code: 'doctor-office', name: 'Ca hành chính', start: '08:00', end: '17:00', minutes: 480 };
    }

    // 2. Nhóm Lễ tân & Phụ tá
    if (isFront) {
      if (s.includes('sáng') || s === 'sang' || s === 's' || s === 'front-morning') {
        return { code: 'front-morning', name: 'Ca sáng', start: '07:30', end: '18:00', minutes: 570 };
      }
      if (s.includes('chiều') || s === 'chieu' || s === 'c' || s === 'front-afternoon') {
        return { code: 'front-afternoon', name: 'Ca chiều', start: '09:30', end: '20:00', minutes: 570 };
      }
      if (s.includes('full') || s.includes('cả ngày') || s === 'f' || s === 'front-full') {
        return { code: 'front-full', name: 'Ca full', start: '07:30', end: '20:00', minutes: 690 };
      }
      return { code: 'front-office', name: 'Ca hành chính', start: '07:30', end: '17:00', minutes: 510 };
    }

    // 3. Nhóm Bảo vệ
    if (isSecurity) {
      return { code: 'security-weekday', name: 'Ngày thường', start: '07:00', end: '20:00', minutes: 780 };
    }

    // 4. Nhóm Tạp vụ
    if (isCleaning) {
      return { code: 'cleaning-weekday', name: 'Ngày thường', start: '06:00', end: '16:00', minutes: 540 };
    }

    // 5. Khối Văn phòng / Marketing / IT / Kế toán / Nhân sự
    if (isOffice) {
      if (s.includes('sáng') || s === 'sang' || s === 's') {
        return { code: 'office-morning', name: 'Ca sáng', start: '08:00', end: '12:00', minutes: 240 };
      }
      if (s.includes('chiều') || s === 'chieu' || s === 'c') {
        return { code: 'office-afternoon', name: 'Ca chiều', start: '13:00', end: '17:00', minutes: 240 };
      }
      return { code: 'office-regular', name: 'Ca hành chính', start: '08:00', end: '17:00', minutes: 480 };
    }

    // 6. Fallback
    if (s.includes('sáng') || s === 'sang' || s === 's') {
      return { code: 'front-morning', name: 'Ca sáng', start: '07:30', end: '18:00', minutes: 570 };
    }
    if (s.includes('chiều') || s === 'chieu' || s === 'c') {
      return { code: 'doctor-afternoon', name: 'Ca chiều', start: '10:00', end: '20:00', minutes: 540 };
    }
    return { code: 'clinic-0800', name: 'Ca hành chính', start: '08:00', end: '17:00', minutes: 480 };
  }

  async findEmployeeInText(text: string): Promise<{ code: string; name: string; dept: string; title: string; branch: string } | null> {
    try {
      const res = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where (entity_type='profiles' or entity_type='employees') and deleted_at is null`,
      );
      const textNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let bestMatch: { code: string; name: string; dept: string; title: string; branch: string } | null = null;
      let maxNameLength = 0;

      for (const row of res.rows) {
        const p = row.payload || {};
        const code = String(p.employee_code || p.code || '').trim();
        const fullName = String(p.full_name || p.name || '').trim();
        if (!code && !fullName) continue;

        if (code && new RegExp(`\\b${code}\\b`, 'i').test(text)) {
          return {
            code,
            name: fullName || code,
            dept: String(p.department || ''),
            title: String(p.title || ''),
            branch: String(p.branch_id || p.branch || 'PVC'),
          };
        }

        if (fullName.length >= 3) {
          const nameNorm = fullName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (textNorm.includes(nameNorm) && nameNorm.length > maxNameLength) {
            maxNameLength = nameNorm.length;
            bestMatch = {
              code: code || 'NV_AUTO',
              name: fullName,
              dept: String(p.department || ''),
              title: String(p.title || ''),
              branch: String(p.branch_id || p.branch || 'PVC'),
            };
          }
        }
      }
      return bestMatch;
    } catch {
      return null;
    }
  }

  extractTimesFromText(
    text: string,
    defaultStart: string | null = null,
    defaultEnd: string | null = null,
    intent?: string,
  ): { startTime: string | null; endTime: string | null; overtimeMinutes: number } {
    const lower = text.toLowerCase();
    let startTime: string | null = null;
    let endTime: string | null = null;

    // 1. Dải giờ: "17h -> 17h49", "17h --> 17h49", "17h => 17h49", "17h - 17h49", "17:00 - 17:49", "từ 17h đến 17h49", "17h sang 17h49", "17h tới 17h49"
    const rangeRegex = /(?:từ\s+|lúc\s+)?(\d{1,2})(?:\s*[:hH]\s*|\s*giờ\s*)(\d{0,2})(?:\s*phút|\s*p)?\s*(?:->|-->|=>|==>|-|–|—|đến|tới|sang)\s*(\d{1,2})(?:\s*[:hH]\s*|\s*giờ\s*)(\d{0,2})(?:\s*phút|\s*p)?/i;
    const rangeMatch = lower.match(rangeRegex);

    if (rangeMatch) {
      const sH = rangeMatch[1].padStart(2, '0');
      const sM = (rangeMatch[2] || '00').padEnd(2, '0');
      const eH = rangeMatch[3].padStart(2, '0');
      const eM = (rangeMatch[4] || '00').padEnd(2, '0');
      startTime = `${sH}:${sM}`;
      endTime = `${eH}:${eM}`;
    } else {
      // 2. Dạng kết thúc: "đến 17h49", "tới 18h", "về lúc 17h49"
      const untilRegex = /(?:đến|tới|về lúc|về trễ lúc)\s*(\d{1,2})(?:\s*[:hH]\s*|\s*giờ\s*)(\d{0,2})(?:\s*phút|\s*p)?/i;
      const untilMatch = lower.match(untilRegex);
      if (untilMatch) {
        const uH = untilMatch[1].padStart(2, '0');
        const uM = (untilMatch[2] || '00').padEnd(2, '0');
        const matchedTime = `${uH}:${uM}`;
        if (intent === 'tang_ca') {
          startTime = defaultEnd || '17:00';
          endTime = matchedTime;
        } else {
          startTime = defaultStart || '07:30';
          endTime = matchedTime;
        }
      } else {
        // 3. Tìm các cụm chỉ giờ có trong câu
        const allTimesRegex = /(\d{1,2})\s*[:hH]\s*(\d{0,2})/g;
        const matches: Array<{ h: string; m: string }> = [];
        let m;
        while ((m = allTimesRegex.exec(lower)) !== null) {
          matches.push({ h: m[1].padStart(2, '0'), m: (m[2] || '00').padEnd(2, '0') });
        }
        if (matches.length >= 2) {
          startTime = `${matches[0].h}:${matches[0].m}`;
          endTime = `${matches[1].h}:${matches[1].m}`;
        } else if (matches.length === 1) {
          const singleTime = `${matches[0].h}:${matches[0].m}`;
          if (intent === 'tang_ca') {
            startTime = defaultEnd || '17:00';
            endTime = singleTime;
          } else {
            startTime = singleTime;
            endTime = defaultEnd;
          }
        }
      }
    }

    if (!startTime) startTime = defaultStart;
    if (!endTime) endTime = defaultEnd;

    // Tự động hoán vị nếu giờ bắt đầu lớn hơn giờ kết thúc trên cùng ngày (ví dụ người dùng gõ 17h49 - 17h)
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      if (Number.isFinite(sh) && Number.isFinite(eh) && (sh * 60 + sm > eh * 60 + em)) {
        const temp = startTime;
        startTime = endTime;
        endTime = temp;
      }
    }

    let overtimeMinutes = 0;
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      if (Number.isFinite(sh) && Number.isFinite(eh)) {
        overtimeMinutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
      }
    }

    return { startTime, endTime, overtimeMinutes };
  }

  extractSlotsFallback(rawText: string, employeeCode?: string, employeeName?: string, empDept?: string, empTitle?: string): JsonMap {
    const text = String(rawText || '').trim();
    const lower = text.toLowerCase();

    // 1. Intent Detection
    let intent: 'doi_ca_truc' | 'bo_sung_cham_cong' | 'tang_ca' | 'xin_nghi_phep' | 'khac' = 'khac';
    let intentLabel = 'Yêu cầu nhân sự';

    if (/(đổi ca|đổi lịch|nhờ trực|thế ca|trực thay|hoán đổi ca|chuyển ca)/i.test(lower)) {
      intent = 'doi_ca_truc';
      intentLabel = 'Đổi ca trực';
    } else if (/(tăng ca|làm thêm|overtime|\bot\b)/i.test(lower)) {
      intent = 'tang_ca';
      intentLabel = 'Đơn tăng ca';
    } else if (/(chấm công|bổ sung công|bổ sung chấm|quên chấm|quên check|quên bấm|bấm công|sửa công|chưa check|điểm danh|ghi nhận công)/i.test(lower)) {
      intent = 'bo_sung_cham_cong';
      intentLabel = 'Bổ sung chấm công';
    } else if (/(xin nghỉ|nghỉ phép|nghỉ ốm|nghỉ việc riêng|nghỉ ngày)/i.test(lower)) {
      intent = 'xin_nghi_phep';
      intentLabel = 'Xin nghỉ phép';
    }

    // 2. Branch Detection
    let branch = 'PVC';
    if (/(lvt|lê văn thọ)/i.test(lower)) {
      branch = 'LVT';
    } else if (/(pvc|phạm văn chiêu)/i.test(lower)) {
      branch = 'PVC';
    }

    // 3. Shift Detection
    let rawShift: string | null = null;
    if (/(ca sáng|buổi sáng|\bsáng\b)/i.test(lower)) rawShift = 'sáng';
    else if (/(ca chiều|buổi chiều|\bchiều\b)/i.test(lower)) rawShift = 'chiều';
    else if (/(ca tối|buổi tối|\btối\b)/i.test(lower)) rawShift = 'tối';
    else if (/(ca full|cả ngày|full ca|\bfull\b)/i.test(lower)) rawShift = 'full';
    else if (/(hành chính)/i.test(lower)) rawShift = 'hành chính';

    const resolvedShift = this.resolveClinicShift(rawShift, employeeCode, empDept, empTitle);
    const shift = resolvedShift.name;
    const shiftCode = resolvedShift.code;

    // 4. Date Extraction
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [currentYear, currentMonth] = today.split('-');
    let workDate = today;
    let toDate = workDate;

    // Check "29-30/09" or "29 đến 30/09"
    const rangeMatch = lower.match(/(?:từ\s+)?(\d{1,2})\s*(?:-|–|đến)\s*(\d{1,2})[/-](\d{1,2})/);
    if (rangeMatch) {
      const fromDay = rangeMatch[1].padStart(2, '0');
      const toDay = rangeMatch[2].padStart(2, '0');
      const month = rangeMatch[3].padStart(2, '0');
      workDate = `${currentYear}-${month}-${fromDay}`;
      toDate = `${currentYear}-${month}-${toDay}`;
    } else {
      // Single date e.g. "26/09"
      const dateMatch = lower.match(/(\d{1,2})[/-](\d{1,2})/);
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        workDate = `${currentYear}-${month}-${day}`;
        toDate = workDate;
      } else {
        const singleDayMatch = lower.match(/(?:ngày|hôm)\s*(\d{1,2})/);
        if (singleDayMatch) {
          const day = singleDayMatch[1].padStart(2, '0');
          workDate = `${currentYear}-${currentMonth}-${day}`;
          toDate = workDate;
        } else if (lower.includes('hôm qua')) {
          const yesterday = new Date(`${today}T00:00:00.000Z`);
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          workDate = yesterday.toISOString().slice(0, 10);
          toDate = workDate;
        } else if (lower.includes('ngày mai')) {
          const tomorrow = new Date(`${today}T00:00:00.000Z`);
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          workDate = tomorrow.toISOString().slice(0, 10);
          toDate = workDate;
        }
      }
    }

    // 5. Time extraction (hỗ trợ dạng 17h -> 17h49, 17:00 - 17:49, 17h đến 17h49, tăng ca đến 18h...)
    const { startTime, endTime, overtimeMinutes } = this.extractTimesFromText(
      text,
      resolvedShift.start,
      resolvedShift.end,
      intent,
    );

    // 6. Target colleague (chỉ áp dụng cho đổi ca)
    let targetEmployeeName: string | null = null;
    if (intent === 'doi_ca_truc') {
      const partnerMatch = text.match(/(?:với|nhờ|bàn giao cho|thay cho|đổi với)\s+(?:bạn|chị|anh|em)?\s*([A-ZÀ-Ỹa-zà-ỹ\s]{2,20}?)(?:\s+(?:ca|ngày|ở|tại|do|vì|về|$))/i);
      if (partnerMatch && partnerMatch[1]) {
        targetEmployeeName = partnerMatch[1].trim();
      }
    }

    // 7. Reason extraction
    let reason = text;
    const reasonMatch = text.match(/(?:do|vì|bởi vì)\s+([^,.;]+)/i);
    if (reasonMatch && reasonMatch[1]) {
      reason = reasonMatch[1].trim();
    }

    // 8. Sanity Check
    let sanityCheck = '✅ Hợp lệ: Yêu cầu đầy đủ dữ kiện. Đã đối chiếu đúng ca theo chức danh nhân sự.';
    if (intent === 'doi_ca_truc') {
      sanityCheck = targetEmployeeName
        ? `✅ Hợp lệ: Đã xác định người đổi (${targetEmployeeName}) tại chi nhánh ${branch}. Ca: ${shift} (${startTime}–${endTime}).`
        : `⚠️ Cần kiểm tra: Chưa rõ người nhận thế ca, quản lý cần xác nhận trước khi duyệt.`;
    } else if (intent === 'tang_ca') {
      sanityCheck = `✅ Hợp lệ: Đơn tăng ca ${startTime}–${endTime} ngày ${workDate} (${overtimeMinutes} phút).`;
    } else if (intent === 'bo_sung_cham_cong') {
      sanityCheck = `✅ Hợp lệ: Bổ sung công ca ${shift} (${startTime}–${endTime}) ngày ${workDate} theo vị trí công tác.`;
    } else if (intent === 'xin_nghi_phep') {
      sanityCheck = `✅ Hợp lệ: Đã có kế hoạch bàn giao công việc. Số ngày nghỉ đề xuất: ${workDate === toDate ? '1 ngày' : '2 ngày'}.`;
    }

    return {
      intent,
      intentLabel,
      employeeCode: employeeCode || 'NV_AUTO',
      employeeName: employeeName || 'Nhân sự',
      targetEmployeeName,
      targetEmployeeCode: null,
      workDate,
      toDate,
      shift,
      shiftCode,
      startTime,
      endTime,
      overtimeMinutes,
      branch,
      reason,
      urgency: 'normal',
      confidence: 0.95,
      summary: `${intentLabel} - Ngày ${workDate} (${shift}) tại ${branch}`,
      sanityCheck,
    };
  }

  async processGeminiPrompt(
    prompt: string,
    employeeCode?: string,
    employeeName?: string,
    userRole?: string,
  ): Promise<JsonMap> {
    const rawText = String(prompt || '').trim();
    if (!rawText) throw new BadRequestException('Vui lòng nhập nội dung yêu cầu.');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    let empTitle = '';
    let empDept = '';
    let resolvedEmployeeName = employeeName;
    let resolvedEmployeeCode = employeeCode;
    let resolvedBranch = 'PVC';

    const detectedEmp = await this.findEmployeeInText(rawText);
    const isManagerRole = ['admin', 'admin_it', 'superadmin', 'leader', 'hr', 'phu_ta_truong', 'manager', 'branch_manager'].includes(userRole || '');

    if (detectedEmp) {
      const isSelf = !employeeCode || detectedEmp.code.toLowerCase() === String(employeeCode).toLowerCase();
      if (isSelf || isManagerRole) {
        resolvedEmployeeCode = detectedEmp.code;
        resolvedEmployeeName = detectedEmp.name;
        empDept = detectedEmp.dept;
        empTitle = detectedEmp.title;
        resolvedBranch = detectedEmp.branch || 'PVC';
      }
    } else if (resolvedEmployeeCode) {
      try {
        const empProfile = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where (entity_type='profiles' or entity_type='employees') and deleted_at is null and lower(payload->>'employee_code')=lower($1) limit 1`,
          [resolvedEmployeeCode],
        );
        const empData = empProfile.rows[0]?.payload || {};
        empTitle = String(empData.title || '');
        empDept = String(empData.department || '');
        if (!resolvedEmployeeName && empData.full_name) resolvedEmployeeName = String(empData.full_name);
        if (empData.branch_id || empData.branch) resolvedBranch = String(empData.branch_id || empData.branch);
      } catch {}
    }

    let apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JU5HAeaWt1evBsfpsapqF4cirPgFgPoNHUgijys_jnFg';
    let model = 'gemini-2.0-flash';
    try {
      const cur = await this.infrastructure.postgres.query<{ config_value: string }>(
        `select config_value from app.bot_config where config_key = 'gemini_assistant_config'`,
      );
      if (cur.rows.length > 0) {
        const parsed = JSON.parse(cur.rows[0].config_value || '{}');
        if (parsed.apiKey) apiKey = parsed.apiKey;
        if (parsed.model) model = parsed.model;
      }
    } catch {}

    const startTime = Date.now();
    let result: any = null;
    let usedAi = false;

    if (apiKey) {
      try {
        const sysInstruction = `Bạn là Trợ lý AI Chuyên viên Điều phối Nhân sự & Lịch trực của Hệ thống Nha khoa Clinic Hub 5S.
Nhiệm vụ: Phân tích yêu cầu nhắn tự nhiên của nhân viên (xin đổi ca, xin nghỉ phép, bổ sung công) và trích xuất JSON cấu trúc chuẩn xác theo đúng chức danh và bộ phận phòng khám.
Nhân viên yêu cầu: ${resolvedEmployeeName || 'Nhân sự'} (Mã: ${employeeCode || 'NV_AUTO'}, Chức danh: ${empTitle || 'Chuyên môn'}, Bộ phận: ${empDept || 'Toàn hệ thống'}).

Quy định ca trực chuẩn theo vị trí công việc:
1. Nhóm Bác sĩ:
   - Ca sáng (doctor-morning: 08:00 - 18:00)
   - Ca chiều (doctor-afternoon: 10:00 - 20:00)
   - Ca hành chính (doctor-office: 08:00 - 17:00)
   - Ca full (doctor-full: 08:00 - 20:00)
2. Nhóm Lễ tân, Phụ tá:
   - Ca sáng (front-morning: 07:30 - 18:00)
   - Ca chiều (front-afternoon: 09:30 - 20:00)
   - Ca hành chính (front-office: 07:30 - 17:00)
   - Ca full (front-full: 07:30 - 20:00)
3. Nhóm Bảo vệ: security-weekday (07:00 - 20:00) / security-sunday (07:00 - 17:00)
4. Nhóm Tạp vụ: cleaning-weekday (06:00 - 16:00) / cleaning-sunday (06:00 - 15:00)
5. Chung: clinic-0800 (08:00 - 17:00)

Quy ước Intent:
- "tang_ca": Đơn xin tăng ca, làm thêm giờ, báo về trễ (ví dụ tăng ca từ 20h đến 20h12).
- "bo_sung_cham_cong": Các câu xin bổ sung công cho bản thân, quên chấm công, quên check-in/out.
- "doi_ca_truc": Xin đổi ca với ai, đổi lịch trực, trực thay.
- "xin_nghi_phep": Xin nghỉ phép, nghỉ ốm, việc riêng.

QUY TẮC BẢO MẬT: Mỗi nhân sự chỉ được làm đơn cho chính mình, tuyệt đối không làm hộ người khác (trừ đổi ca).

Hôm nay là ${today}. Nếu chỉ có ngày (ví dụ "ngày 24"), hãy dùng tháng và năm của ngày hôm nay.
Nếu nhân viên không nói rõ ca, hãy mặc định là Ca hành chính của vị trí đó.
Trả về JSON đúng cấu trúc sau:
{
  "intent": "doi_ca_truc" | "bo_sung_cham_cong" | "tang_ca" | "xin_nghi_phep" | "khac",
  "intentLabel": "Đổi ca trực" | "Bổ sung chấm công" | "Đơn tăng ca" | "Xin nghỉ phép" | "Yêu cầu khác",
  "employeeCode": "${employeeCode || 'NV_AUTO'}",
  "employeeName": "${resolvedEmployeeName || 'Nhân viên'}",
  "targetEmployeeName": "Tên đồng nghiệp đổi ca hoặc bàn giao nếu có, hoặc null",
  "targetEmployeeCode": null,
  "workDate": "YYYY-MM-DD",
  "toDate": "YYYY-MM-DD",
  "shift": "Ca sáng" | "Ca chiều" | "Ca hành chính" | "Ca full",
  "shiftCode": "Mã ca chuẩn (ví dụ doctor-afternoon hoặc front-afternoon)",
  "startTime": "HH:mm hoặc null",
  "endTime": "HH:mm hoặc null",
  "overtimeMinutes": 12 hoặc null,
  "branch": "PVC" | "LVT" | "Toàn hệ thống",
  "reason": "Tóm tắt lý do rõ ràng",
  "urgency": "normal" | "urgent",
  "confidence": 0.98,
  "summary": "Tóm tắt 1 câu ngắn gọn để Sếp duyệt",
  "sanityCheck": "Đánh giá tính hợp lệ của yêu cầu theo vị trí công tác"
}`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Yêu cầu từ nhân viên: "${rawText}"` }] }],
            systemInstruction: { parts: [{ text: sysInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        });

        if (aiResponse.ok) {
          const aiJson = await aiResponse.json();
          const partText = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (partText) {
            result = JSON.parse(partText);
            usedAi = true;
          }
        } else {
          const errText = await aiResponse.text();
          this.logger.warn(`Gemini API failed [${aiResponse.status}]: ${errText}. Using smart fallback.`);
        }
      } catch (e) {
        this.logger.warn(`Gemini call error: ${e}. Using smart fallback.`);
      }
    }

    if (!result) {
      result = this.extractSlotsFallback(rawText, employeeCode, resolvedEmployeeName, empDept, empTitle);
      usedAi = false;
    }

    // Đảm bảo shiftCode luôn được map chuẩn xác theo chức danh và cơ sở dữ liệu
    const finalShift = this.resolveClinicShift(result.shiftCode || result.shift, resolvedEmployeeCode, empDept, empTitle);
    result.shiftCode = finalShift.code;
    result.shift = finalShift.name;
    if (!result.startTime) result.startTime = finalShift.start;
    if (!result.endTime) result.endTime = finalShift.end;

    // Chuẩn hóa giờ tăng ca và tự động hoán vị nếu bị đảo ngược
    if (result.startTime && result.endTime) {
      const [sh, sm] = String(result.startTime).split(':').map(Number);
      const [eh, em] = String(result.endTime).split(':').map(Number);
      if (Number.isFinite(sh) && Number.isFinite(eh) && (sh * 60 + sm > eh * 60 + em)) {
        const tmp = result.startTime;
        result.startTime = result.endTime;
        result.endTime = tmp;
      }
      if (result.intent === 'tang_ca') {
        const [nsh, nsm] = String(result.startTime).split(':').map(Number);
        const [neh, nem] = String(result.endTime).split(':').map(Number);
        result.overtimeMinutes = Math.max(0, (neh * 60 + nem) - (nsh * 60 + nsm));
      }
    }

    if (!result.employeeCode) result.employeeCode = resolvedEmployeeCode || 'NV_AUTO';
    if (!result.employeeName) result.employeeName = resolvedEmployeeName || 'Nhân sự';
    if (!result.branch) result.branch = resolvedBranch;
    if (!result.requestId) result.requestId = `req_${Date.now()}`;
    result.processingTimeMs = Date.now() - startTime;
    result.model = usedAi ? model : 'Smart Semantic Fallback';
    result.usedAi = usedAi;
    result.rawPrompt = rawText;

    // Cache the pending request so Telegram callback or web can approve it!
    this.pendingGeminiRequests.set(result.requestId, result);
    try {
      await this.infrastructure.postgres.query(
        `insert into app.records (entity_type, record_key, payload, origin, updated_at)
         values ('gemini_pending_requests', $1, $2::jsonb, 'vps', now())
         on conflict (entity_type, record_key) do update set payload = excluded.payload, updated_at = now()`,
        [result.requestId, JSON.stringify(result)],
      );
    } catch {}

    return {
      success: true,
      data: result,
    };
  }

  async approveGeminiRequest(payload: JsonMap, approverName = 'Admin Sếp'): Promise<JsonMap> {
    try {
      const employeeCode = String(payload.employeeCode || 'NV_AUTO').trim();
      const workDate = payload.workDate || new Date().toISOString().slice(0, 10);
      const toDate = payload.toDate || workDate;

      // 1. Lấy thông tin nhân sự để xác định đúng chức danh & phòng ban
      let empTitle = '';
      let empDept = '';
      let empFullName = '';
      let userId = employeeCode;
      try {
        const empProfile = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where (entity_type='profiles' or entity_type='employees') and deleted_at is null and lower(payload->>'employee_code')=lower($1) limit 1`,
          [employeeCode],
        );
        const empData = empProfile.rows[0]?.payload || {};
        empTitle = String(empData.title || '');
        empDept = String(empData.department || '');
        empFullName = String(empData.full_name || '');
        if (empData.id) userId = String(empData.id);
      } catch {}

      // Chuẩn hóa ca làm việc theo đúng vị trí của nhân sự (Bác sĩ vs Phụ tá vs Bảo vệ...)
      const shiftInfo = this.resolveClinicShift(payload.shiftCode || payload.shift, employeeCode, empDept, empTitle);
      const shiftCode = shiftInfo.code;
      const shiftName = shiftInfo.name;

      let intent = payload.intent || 'bo_sung_cham_cong';
      if (intent === 'khac') {
        const reasonStr = String(payload.reason || payload.rawPrompt || '').toLowerCase();
        if (/(chấm công|bổ sung|điểm danh|ghi nhận công|công hộ|chấm hộ)/i.test(reasonStr)) {
          intent = 'bo_sung_cham_cong';
        } else if (/(đổi ca|thế ca|trực thay|đổi lịch)/i.test(reasonStr)) {
          intent = 'doi_ca_truc';
        } else {
          intent = 'bo_sung_cham_cong';
        }
      }

      const rawBranch = String(payload.branch || 'pham-van-chieu');
      const branchId = rawBranch.toLowerCase().includes('lê') || rawBranch.toLowerCase().includes('tho') || rawBranch.toUpperCase().includes('LVT')
        ? 'le-van-tho'
        : 'pham-van-chieu';
      const branchLat = branchId === 'le-van-tho' ? 10.8381574 : 10.848632;
      const branchLng = branchId === 'le-van-tho' ? 106.6579553 : 106.649181;
      const reason = payload.reason || payload.summary || 'Trợ lý AI Gemini hỗ trợ lập theo chỉ đạo Sếp';

      let startTime = payload.startTime || shiftInfo.start;
      let endTime = payload.endTime || shiftInfo.end;

      let recordId: any = null;
      let checkinId: string | null = null;
      let checkoutId: string | null = null;

      const isOvertime = intent === 'tang_ca' || /(tăng ca|overtime)/i.test(String(payload.request_type || payload.reason || payload.intentLabel || ''));
      let overtimeMinutes = Number(payload.overtimeMinutes || 0);
      if (isOvertime && !overtimeMinutes && startTime && endTime) {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        if (Number.isFinite(sh) && Number.isFinite(eh)) {
          overtimeMinutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
        }
      }

      if (intent === 'bo_sung_cham_cong' || intent === 'xin_nghi_phep' || isOvertime) {
        let leaveRecordKey = String(payload.createdRecordId || '').trim();
        if (!leaveRecordKey && payload.requestId) {
          const existing = await this.infrastructure.postgres.query<{ record_key: string }>(
            `select record_key from app.records where entity_type='leave_requests' and deleted_at is null and payload->>'ai_request_id'=$1 limit 1`,
            [payload.requestId],
          );
          if (existing.rows[0]?.record_key) leaveRecordKey = existing.rows[0].record_key;
        }

        const requestType = isOvertime ? 'Đơn tăng ca' : (intent === 'bo_sung_cham_cong' ? 'Bổ sung công' : 'Đơn nghỉ phép');

        if (leaveRecordKey) {
          await this.infrastructure.postgres.query(
            `update app.records
             set payload = payload || $2::jsonb, updated_at = now()
             where entity_type = 'leave_requests' and record_key = $1`,
            [leaveRecordKey, JSON.stringify({
              status: 'approved',
              leader_status: 'approved',
              operations_status: 'approved',
              reviewer_code: approverName,
              overtime_minutes: isOvertime ? overtimeMinutes : 0,
              routed_to: 'ns',
              updated_at: new Date().toISOString(),
            })],
          );
          recordId = leaveRecordKey;
        } else {
          const recordKey = `leave_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const leavePayload = {
            id: recordKey,
            employee_code: employeeCode,
            request_type: requestType,
            from_date: workDate,
            to_date: toDate,
            request_start_time: startTime ? (startTime.length === 5 ? `${startTime}:00` : startTime) : null,
            request_end_time: endTime ? (endTime.length === 5 ? `${endTime}:00` : endTime) : null,
            overtime_minutes: isOvertime ? overtimeMinutes : 0,
            reason,
            status: 'approved',
            leader_status: 'approved',
            operations_status: 'approved',
            reviewer_code: approverName,
            routed_to: 'ns',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          await this.infrastructure.postgres.query(
            `insert into app.records (entity_type, record_key, payload, origin, updated_at)
             values ('leave_requests', $1, $2::jsonb, 'vps', now())`,
            [recordKey, JSON.stringify(leavePayload)],
          );
          recordId = recordKey;
        }

        const nowStr = new Date().toISOString();
        const checkinTimeFormatted = startTime.length === 5 ? `${startTime}:00` : startTime;
        const checkoutTimeFormatted = endTime.length === 5 ? `${endTime}:00` : endTime;
        const checkinIso = `${workDate}T${checkinTimeFormatted}+07:00`;
        const checkoutIso = `${workDate}T${checkoutTimeFormatted}+07:00`;
        const workDayId = `work:${employeeCode}:${workDate}`;

        if (isOvertime) {
          // Xử lý đơn tăng ca: cập nhật checkout và bảng công
          const existingCheckout = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
            `select record_key, payload from app.records where entity_type='attendance_records' and deleted_at is null
             and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 and payload->>'record_type'='checkout' limit 1`,
            [employeeCode, workDate],
          );

          if (existingCheckout.rows[0]) {
            const coKey = existingCheckout.rows[0].record_key;
            const coPayload = existingCheckout.rows[0].payload;
            coPayload.recorded_at = checkoutIso;
            coPayload.note = `${coPayload.note || ''} [Tăng ca ${overtimeMinutes}p duyệt bởi ${approverName}]`.trim();
            await this.infrastructure.postgres.query(
              `update app.records set payload=$2::jsonb, updated_at=now() where entity_type='attendance_records' and record_key=$1`,
              [coKey, JSON.stringify(coPayload)],
            );
            checkoutId = coKey;
          } else {
            checkoutId = `att_co_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const checkoutPayload = {
              id: checkoutId,
              client_event_id: checkoutId,
              employee_code: employeeCode,
              shift_code: shiftCode,
              record_type: 'checkout',
              work_date: workDate,
              recorded_at: checkoutIso,
              branch_id: branchId,
              lat: branchLat,
              lng: branchLng,
              distance_m: 5,
              accuracy_m: 10,
              status: 'valid',
              created_by: approverName,
              device_id: 'gemini-ai-assistant',
              captured_offline: false,
              synced_at: nowStr,
              proof_url: null,
              note: `[DUYỆT GEMINI AI] Tăng ca ${overtimeMinutes}p bởi ${approverName}: ${reason}`,
              created_at: nowStr,
              updated_at: nowStr,
            };
            await this.infrastructure.postgres.query(
              `insert into app.records (entity_type, record_key, payload, origin, updated_at) values ('attendance_records', $1, $2::jsonb, 'vps', now())`,
              [checkoutId, JSON.stringify(checkoutPayload)],
            );
          }

          // Cập nhật attendance_work_days chuẩn
          const existingWorkDay = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
            `select payload from app.records where entity_type='attendance_work_days' and record_key=$1 and deleted_at is null limit 1`,
            [workDayId],
          );

          if (existingWorkDay.rows[0]?.payload) {
            const wp = existingWorkDay.rows[0].payload;
            wp.overtime_minutes = overtimeMinutes;
            wp.approved_overtime_minutes = overtimeMinutes;
            wp.payable_minutes = (Number(wp.regular_minutes) || shiftInfo.minutes) + overtimeMinutes;
            wp.checkout_at = checkoutIso;
            wp.status = 'complete';
            wp.calculated_at = nowStr;
            await this.infrastructure.postgres.query(
              `update app.records set payload=$2::jsonb, updated_at=now() where entity_type='attendance_work_days' and record_key=$1`,
              [workDayId, JSON.stringify(wp)],
            );
          } else {
            const workDayPayload = {
              id: workDayId,
              employee_code: employeeCode,
              work_date: workDate,
              shift_code: shiftCode,
              shift_name: shiftName,
              branch_id: branchId,
              checkout_branch_id: branchId,
              scheduled_minutes: shiftInfo.minutes,
              regular_minutes: shiftInfo.minutes,
              overtime_minutes: overtimeMinutes,
              approved_overtime_minutes: overtimeMinutes,
              overtime_request_ids: [recordId],
              late_minutes: 0,
              early_leave_minutes: 0,
              payable_minutes: shiftInfo.minutes + overtimeMinutes,
              workday_credit: 1.0,
              checkin_at: `${workDate}T${shiftInfo.start}:00+07:00`,
              checkout_at: checkoutIso,
              status: 'complete',
              calculated_at: nowStr,
              source: 'postgresql-vps',
            };
            await this.infrastructure.postgres.query(
              `insert into app.records (entity_type, record_key, payload, origin, updated_at)
               values ('attendance_work_days', $1, $2::jsonb, 'vps-work-calculation', now())
               on conflict (entity_type, record_key) do update set payload = excluded.payload, updated_at = now()`,
              [workDayId, JSON.stringify(workDayPayload)],
            );
          }
        } else if (intent === 'bo_sung_cham_cong') {
          // Bổ sung công thường (checkin + checkout)
          checkinId = `att_ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const checkinPayload = {
            id: checkinId,
            client_event_id: checkinId,
            employee_code: employeeCode,
            shift_code: shiftCode,
            record_type: 'checkin',
            work_date: workDate,
            recorded_at: checkinIso,
            branch_id: branchId,
            lat: branchLat,
            lng: branchLng,
            distance_m: 5,
            accuracy_m: 10,
            status: 'valid',
            created_by: approverName,
            device_id: 'gemini-ai-assistant',
            captured_offline: false,
            synced_at: nowStr,
            proof_url: null,
            note: `[DUYỆT GEMINI AI] Bổ sung công bởi ${approverName}: ${reason}`,
            created_at: nowStr,
            updated_at: nowStr,
          };

          checkoutId = `att_co_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const checkoutPayload = {
            id: checkoutId,
            client_event_id: checkoutId,
            employee_code: employeeCode,
            shift_code: shiftCode,
            record_type: 'checkout',
            work_date: workDate,
            recorded_at: checkoutIso,
            branch_id: branchId,
            lat: branchLat,
            lng: branchLng,
            distance_m: 5,
            accuracy_m: 10,
            status: 'valid',
            created_by: approverName,
            device_id: 'gemini-ai-assistant',
            captured_offline: false,
            synced_at: nowStr,
            proof_url: null,
            note: `[DUYỆT GEMINI AI] Bổ sung công bởi ${approverName}: ${reason}`,
            created_at: nowStr,
            updated_at: nowStr,
          };

          await this.infrastructure.postgres.query(
            `insert into app.records (entity_type, record_key, payload, origin, updated_at) values ('attendance_records', $1, $2::jsonb, 'vps', now())`,
            [checkinId, JSON.stringify(checkinPayload)],
          );
          await this.infrastructure.postgres.query(
            `insert into app.records (entity_type, record_key, payload, origin, updated_at) values ('attendance_records', $1, $2::jsonb, 'vps', now())`,
            [checkoutId, JSON.stringify(checkoutPayload)],
          );

          const workDayPayload = {
            id: workDayId,
            employee_code: employeeCode,
            work_date: workDate,
            shift_code: shiftCode,
            shift_name: shiftName,
            branch_id: branchId,
            checkout_branch_id: branchId,
            scheduled_minutes: shiftInfo.minutes,
            regular_minutes: shiftInfo.minutes,
            overtime_minutes: 0,
            approved_overtime_minutes: 0,
            overtime_request_ids: [],
            late_minutes: 0,
            early_leave_minutes: 0,
            payable_minutes: shiftInfo.minutes,
            workday_credit: 1.0,
            checkin_at: checkinIso,
            checkout_at: checkoutIso,
            status: 'complete',
            calculated_at: nowStr,
            source: 'postgresql-vps',
          };
          await this.infrastructure.postgres.query(
            `insert into app.records (entity_type, record_key, payload, origin, updated_at)
             values ('attendance_work_days', $1, $2::jsonb, 'vps-work-calculation', now())
             on conflict (entity_type, record_key) do update set payload = excluded.payload, updated_at = now()`,
            [workDayId, JSON.stringify(workDayPayload)],
          );
        }
      } else {
        // doi_ca_truc
        let schedReqKey = String(payload.createdRecordId || '').trim();
        if (!schedReqKey && payload.requestId) {
          const existing = await this.infrastructure.postgres.query<{ record_key: string }>(
            `select record_key from app.records where entity_type='schedule_requests' and deleted_at is null and payload->>'ai_request_id'=$1 limit 1`,
            [payload.requestId],
          );
          if (existing.rows[0]?.record_key) schedReqKey = existing.rows[0].record_key;
        }
        if (schedReqKey) {
          await this.infrastructure.postgres.query(
            `update app.records
             set payload = payload || $2::jsonb, updated_at = now()
             where entity_type = 'schedule_requests' and record_key = $1`,
            [schedReqKey, JSON.stringify({
              status: 'approved',
              updated_at: new Date().toISOString(),
            })],
          );
        }

        const recordKey = `sched_${employeeCode}_${workDate}_${Date.now()}`;
        const assignPayload = {
          id: recordKey,
          employee_code: employeeCode,
          branch_id: branchId,
          work_date: workDate,
          shift_code: shiftCode,
          owner_code: payload.targetEmployeeCode || null,
          status: 'planned',
          note: `Đổi sang ${shiftName} (${shiftInfo.start}–${shiftInfo.end}) với ${payload.targetEmployeeName || 'đồng nghiệp'} (Phê duyệt từ xa qua Gemini AI)`,
          created_at: new Date().toISOString(),
        };

        await this.infrastructure.postgres.query(
          `insert into app.records (entity_type, record_key, payload, origin, updated_at)
           values ('schedule_assignments', $1, $2::jsonb, 'vps', now())`,
          [recordKey, JSON.stringify(assignPayload)],
        );
        recordId = recordKey;

        // Dọn dẹp bản ghi work day lỗi missing_shift trước đó nếu có
        await this.infrastructure.postgres.query(
          `delete from app.records where entity_type='attendance_work_days' and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 and payload->>'status'='missing_shift'`,
          [employeeCode, workDate],
        ).catch(() => {});
      }

      // Update action card status in messages table to approved
      try {
        await this.infrastructure.postgres.query(
          `update app.records
           set payload = jsonb_set(payload, '{action_data,status}', '"approved"'), updated_at = now()
           where entity_type = 'messages' and (payload->'action_data'->>'createdRecordId' = $1 or payload->'action_data'->>'workDate' = $2)`,
          [String(recordId || payload.createdRecordId || payload.requestId || ''), workDate],
        );
      } catch {}

      // 2. Gửi thông báo đến đối tượng test (Nhân viên) — ngắn gọn, súc tích
      const intentLabel = payload.intentLabel || (intent === 'bo_sung_cham_cong' ? 'Bổ sung công' : intent === 'doi_ca_truc' ? 'Đổi ca' : 'Nghỉ phép');
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const notifTitle = `✅ Duyệt ${intentLabel}`;
      const notifBody = `Sếp đã duyệt: ${workDate}${shiftName ? ` (${shiftName})` : ''}.`;

      const notifPayload = {
        id: notifId,
        user_id: userId,
        employee_code: employeeCode,
        title: notifTitle,
        body: notifBody,
        type: intent === 'doi_ca_truc' ? 'schedule' : 'attendance',
        link_view: intent === 'doi_ca_truc' ? 'schedule' : 'attendance',
        read: false,
        created_at: new Date().toISOString(),
      };

      await this.infrastructure.postgres.query(
        `insert into app.records (entity_type, record_key, payload, origin, updated_at)
         values ('notifications', $1, $2::jsonb, 'vps', now())`,
        [notifId, JSON.stringify(notifPayload)],
      );

      // Nếu là đổi ca và có đồng nghiệp, gửi thông báo cho cả đồng nghiệp
      if (intent === 'doi_ca_truc' && payload.targetEmployeeCode) {
        const targetProfile = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where entity_type='profiles' and deleted_at is null and lower(payload->>'employee_code')=lower($1) limit 1`,
          [payload.targetEmployeeCode],
        );
        const targetUserId = targetProfile.rows[0]?.payload?.id || payload.targetEmployeeCode;
        const targetNotifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const targetNotifPayload = {
          id: targetNotifId,
          user_id: targetUserId,
          employee_code: payload.targetEmployeeCode,
          title: `🔄 Duyệt đổi ca ${workDate}`,
          body: `Đã duyệt đổi ca ngày ${workDate} với ${payload.employeeName || employeeCode}.`,
          type: 'schedule',
          link_view: 'schedule',
          read: false,
          created_at: new Date().toISOString(),
        };
        await this.infrastructure.postgres.query(
          `insert into app.records (entity_type, record_key, payload, origin, updated_at)
           values ('notifications', $1, $2::jsonb, 'vps', now())`,
          [targetNotifId, JSON.stringify(targetNotifPayload)],
        );

        try {
          const { PushService } = await import('./push');
          const push = new PushService(this.infrastructure);
          void push.sendToEmployee(payload.targetEmployeeCode, {
            title: `🔄 [ĐỔI CA] Lịch trực ngày ${workDate} đã duyệt`,
            body: `Sếp đã duyệt đổi ca trực ngày ${workDate} giữa bạn và ${payload.employeeName || employeeCode}.`,
            view: 'schedule',
            url: '/',
          });
        } catch {}
      }

      // Web Push gửi cho nhân viên chính
      try {
        const { PushService } = await import('./push');
        const push = new PushService(this.infrastructure);
        void push.sendToEmployee(employeeCode, {
          title: notifTitle,
          body: notifBody,
          view: intent === 'doi_ca_truc' ? 'schedule' : 'attendance',
          url: '/',
        });
      } catch {}

      // 3. Ghi log an ninh & kiểm toán
      await this.infrastructure.postgres.query(
        `insert into app.security_events (event_type, severity, actor_name, actor_code, details, created_at)
         values ('server_alert', 'info', $1, 'REMOTE_ADMIN', $2, now())`,
        [approverName, JSON.stringify({ action: 'remote_approval', intent, employeeCode, workDate, approvedAt: new Date().toISOString() })],
      );

      // 4. Đồng bộ dữ liệu Realtime cho toàn hệ thống
      await this.infrastructure.markDataChanged([
        'attendance_records',
        'attendance_work_days',
        'leave_requests',
        'schedule_assignments',
        'notifications',
      ]);

      const nowFormatted = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());

      return {
        success: true,
        message: `Đã phê duyệt thành công yêu cầu [${intentLabel}] và ghi nhận đầy đủ vào hệ thống máy chủ.`,
        recordId,
        checkinId,
        checkoutId,
        notificationId: notifId,
        approvedAt: new Date().toISOString(),
        feedbackForEmployee: {
          employeeCode,
          employeeName: payload.employeeName || employeeCode,
          intent,
          intentLabel,
          workDate,
          startTime,
          endTime,
          shift: payload.shift || 'Hành chính',
          targetEmployeeName: payload.targetEmployeeName || null,
          branch: branchId === 'le-van-tho' ? 'Lê Văn Thọ' : 'Phạm Văn Chiêu',
          status: 'approved',
          approver: approverName,
          timeFormatted: nowFormatted,
          recordsCreated: intent === 'bo_sung_cham_cong' 
            ? ['attendance_records (check-in & check-out)', 'attendance_work_days (1.0 công)', 'leave_requests (Đã duyệt)', 'notifications (Chuông thông báo)']
            : ['schedule_assignments', 'notifications (Chuông thông báo)'],
          summary: `Chào ${payload.employeeName || employeeCode}, yêu cầu ${intentLabel} ngày ${workDate} của bạn đã được ${approverName} PHÊ DUYỆT THÀNH CÔNG!`,
        },
      };
    } catch (e: any) {
      this.logger.error('Error approving gemini request:', e);
      throw new BadRequestException(`Lỗi phê duyệt vào hệ thống: ${e?.message || e}`);
    }
  }

  async sendTelegramApprovalCard(payload: JsonMap, targetChatId?: string): Promise<JsonMap> {
    const adminChatIds = targetChatId ? [String(targetChatId).trim()] : await this.getAdminChatIds();
    if (adminChatIds.length === 0) {
      throw new BadRequestException('Chưa có Telegram Chat ID để nhận thông báo duyệt.');
    }

    const reqId = payload.requestId || `req_${Date.now()}`;
    payload.requestId = reqId;

    // Cache the pending request for Telegram webhook callbacks
    this.pendingGeminiRequests.set(reqId, payload);
    try {
      await this.infrastructure.postgres.query(
        `insert into app.records (entity_type, record_key, payload, origin, updated_at)
         values ('gemini_pending_requests', $1, $2::jsonb, 'vps', now())
         on conflict (entity_type, record_key) do update set payload = excluded.payload, updated_at = now()`,
        [reqId, JSON.stringify(payload)],
      );
    } catch {}

    const isOvertime = payload.intent === 'tang_ca' || String(payload.intentLabel || '').toLowerCase().includes('tăng ca');
    const intentIcon = payload.intent === 'doi_ca_truc' ? '🔄' : payload.intent === 'bo_sung_cham_cong' ? '⏰' : isOvertime ? '⏳' : '🏖️';
    const timeDetail = isOvertime && payload.overtimeMinutes
      ? `${payload.overtimeMinutes} phút (${payload.startTime || ''} ➔ ${payload.endTime || ''})`
      : `${payload.shift || ''} ${payload.startTime ? `(${payload.startTime}${payload.endTime ? ` – ${payload.endTime}` : ''})` : ''}`.trim();

    const roleInfo = [payload.department, payload.title].filter(Boolean).join(' | ');
    const lines = [
      `⚡ <b>[ƯU TIÊN DUYỆT] ĐƠN TỪ TỪ AI TRỢ LÝ 5S</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📋 <b>Loại:</b> ${intentIcon} ${this.escapeHtml(payload.intentLabel || (isOvertime ? 'Đơn tăng ca' : 'Yêu cầu nhân sự'))}`,
      `👤 <b>Nhân sự:</b> <b>${this.escapeHtml(payload.employeeName || 'Nhân sự')}</b> (<code>${this.escapeHtml(payload.employeeCode || '')}</code>)${roleInfo ? ` — <i>${this.escapeHtml(roleInfo)}</i>` : ''}`,
      `📅 <b>Ngày áp dụng:</b> <code>${this.escapeHtml(payload.workDate || '')}</code> ${payload.toDate && payload.toDate !== payload.workDate ? `đến <code>${this.escapeHtml(payload.toDate)}</code>` : ''}`,
      `⏰ <b>Thời gian:</b> <b>${this.escapeHtml(timeDetail)}</b>`,
      `🏥 <b>Chi nhánh:</b> ${this.escapeHtml(payload.branch || 'Toàn hệ thống')}`,
      payload.intent === 'doi_ca_truc' && payload.targetEmployeeName ? `👥 <b>Người đổi ca:</b> <b>${this.escapeHtml(payload.targetEmployeeName)}</b>` : '',
      `📝 <b>Lý do:</b> <i>${this.escapeHtml(payload.reason || payload.summary || '')}</i>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🔍 <b>AI Thẩm định:</b> ${this.escapeHtml(payload.sanityCheck || 'Hợp lệ theo tiêu chuẩn phòng khám')}`,
      `⚡ <i>Nhấn nút bên dưới để Sếp duyệt ngay lập tức:</i>`,
    ].filter(Boolean);

    const text = lines.join('\n');
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Phê duyệt ngay', callback_data: `gemini_approve:${reqId}` },
          { text: '❌ Từ chối', callback_data: `gemini_reject:${reqId}` },
        ],
      ],
    };

    let sentCount = 0;
    for (const chatId of adminChatIds) {
      const ok = await this.sendRawMessage(chatId, text, 'HTML', keyboard);
      if (ok) sentCount++;
    }

    return {
      success: sentCount > 0,
      sentCount,
      message: sentCount > 0 ? `Đã gửi thẻ duyệt đến ${sentCount} tài khoản Telegram của Sếp.` : 'Không gửi được tin nhắn Telegram.',
    };
  }

  async processGeminiChat(user: AuthUser, promptText: string): Promise<JsonMap> {
    const rawText = String(promptText || '').trim();
    if (!rawText) throw new BadRequestException('Vui lòng nhập nội dung.');

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    if (this.geminiUsageStats.date !== today) {
      this.geminiUsageStats = { date: today, totalToday: 0, successAi: 0, fallback: 0, rateLimitSwitches: 0 };
    }
    this.geminiUsageStats.totalToday++;

    const config = await this.getGeminiRawConfig();
    const dailyLimit = Number(config.dailyLimit || 1000);
    if (this.geminiUsageStats.totalToday > dailyLimit) {
      this.logger.warn(`Gemini daily limit reached (${this.geminiUsageStats.totalToday}/${dailyLimit})`);
    }

    const keys: string[] = Array.isArray(config.apiKeys) && config.apiKeys.length > 0
      ? config.apiKeys
      : (config.apiKey ? [config.apiKey] : [process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JU5HAeaWt1evBsfpsapqF4cirPgFgPoNHUgijys_jnFg']);
    let model = config.model || 'gemini-2.0-flash';
    if (model === 'gemini-3.6-flash' || model === 'gemini-2.5-flash') {
      model = 'gemini-2.0-flash';
    }

    let empName = String(user.profile?.full_name || user.employeeCode);
    let empCode = user.employeeCode;
    let empDept = user.department || '';
    let empTitle = String(user.profile?.title || '');
    let branch = user.branchId || 'pham-van-chieu';
    const startTime = Date.now();

    // Nhận diện nhân sự từ tin nhắn (ví dụ: "Lê Kha Thy tăng ca lúc 17h -> 17h49...")
    const detectedEmp = await this.findEmployeeInText(rawText);
    const isManagerRole = ['admin', 'admin_it', 'superadmin', 'leader', 'hr', 'phu_ta_truong', 'manager', 'branch_manager', 'bep_truong', 'dieu_duong_truong'].includes(user.role);
    let isUnauthorizedProxy = false;

    if (detectedEmp) {
      const isSelf = detectedEmp.code.toLowerCase() === user.employeeCode.toLowerCase()
        || detectedEmp.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === empName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (isSelf || isManagerRole) {
        empCode = detectedEmp.code;
        empName = detectedEmp.name;
        empDept = detectedEmp.dept || empDept;
        empTitle = detectedEmp.title || empTitle;
        if (detectedEmp.branch) branch = detectedEmp.branch;
      } else {
        isUnauthorizedProxy = true;
      }
    }

    if (isUnauthorizedProxy && detectedEmp) {
      return {
        type: 'qa',
        intent: 'hoi_dap',
        intentLabel: 'Từ chối làm hộ',
        reply: `Dạ theo quy tắc bảo mật và quản trị dữ liệu của hệ thống Nha khoa 5S, mỗi tài khoản chỉ phục vụ ghi nhận dữ liệu cho chính nhân sự đó, không được phép tạo đơn hay can thiệp dữ liệu cho ${detectedEmp.name} ạ. Nhờ anh/chị nhắn đồng nghiệp tự đăng nhập tài khoản của bạn ấy để gửi yêu cầu nhé!`,
        requestId: `req_${Date.now()}`,
        processingTimeMs: Date.now() - startTime,
        model: 'Security Guardrail',
        usedAi: false,
        employeeCode: user.employeeCode,
        employeeName: user.profile?.full_name || user.employeeCode,
      };
    }
    const channel = `dm:${[user.id, 'ai_assistant'].sort().join(':')}`;
    let recentContext = '';
    let pendingClarification = false;
    let previousRequestText = '';
    try {
      const history = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='messages' and deleted_at is null
         and payload->>'channel'=$1 order by payload->>'created_at' desc limit 6`,
        [channel],
      );
      const latest = history.rows[0]?.payload;
      const previous = history.rows[1]?.payload;
      previousRequestText = String(previous?.body || '');
      pendingClarification = latest?.sender_id === 'ai_assistant'
        && String(latest.body || '').includes('Em chưa gửi đơn để tránh ghi sai')
        && previous?.sender_id === user.id
        && /(xin|đăng ký|báo|gửi đơn|tạo đơn|bổ sung|quên chấm|quên check|đổi ca|đổi lịch|trực thay|tăng ca|làm thêm|nghỉ phép|nghỉ ốm)/i.test(previousRequestText);
      recentContext = history.rows.reverse().map(({ payload }) =>
        `${payload.sender_id === 'ai_assistant' ? 'Trợ lý' : 'Nhân viên'}: ${String(payload.body || '').slice(0, 500)}`,
      ).join('\n');
    } catch {
      // Continue without conversation context if history is unavailable.
    }

    const sysInstruction = `Bạn là Trợ lý AI Thông minh & Thân thiện của Hệ thống Nha khoa Clinic Hub 5S.
Nhiệm vụ: Chỉ hỗ trợ hỏi đáp nhân sự và yêu cầu xin nghỉ phép, bổ sung chấm công, tăng ca, đổi ca trực. Từ chối ngắn gọn câu hỏi ngoài phạm vi.
Nhân viên đang trò chuyện: ${empName} (Mã NV: ${empCode}, Bộ phận: ${empDept}, Vị trí: ${empTitle}).
Hôm nay là ${today} theo giờ Việt Nam. Chỉ tiếp tục tạo đơn từ tin nhắn ngắn nếu tin nhắn ngay trước đó của trợ lý đã hỏi bổ sung dữ kiện cho một yêu cầu rõ ràng.

QUY TẮC BẢO MẬT & NGUYÊN TẮC CHÍNH CHỦ (BẮT BUỘC TUÂN THỦ 100%):
- Mỗi tài khoản nhân sự CHỈ ĐƯỢC PHÉP tạo yêu cầu cho CHÍNH BẢN THÂN MÌNH (${empName} - ${empCode}).
- TUYỆT ĐỐI KHÔNG ĐƯỢC tạo đơn, chấm công hộ, báo tăng ca hộ hay xin nghỉ hộ cho bất kỳ nhân sự nào khác trong hệ thống!
- Ngoại lệ duy nhất: Đơn đổi ca trực ("doi_ca_truc") thì được phép nêu tên đồng nghiệp muốn đổi ca cùng vào trường "targetEmployeeName".
- Nếu nhân viên yêu cầu xin nghỉ, chấm công, tăng ca cho người khác (ví dụ: "Huỳnh tăng ca...", "chấm công hộ Lan", "xin nghỉ cho Tuấn"):
  -> BẮT BUỘC đặt "type": "qa", "intent": "hoi_dap", "intentLabel": "Từ chối làm hộ".
  -> "reply": "Dạ theo quy định bảo mật của hệ thống 5S, mỗi tài khoản nhân sự chỉ phục vụ quản lý và ghi nhận dữ liệu cho chính mình, không được tạo đơn thay hoặc can thiệp dữ liệu của người khác để đảm bảo tính minh bạch. Nhờ anh/chị báo bạn [Tên đồng nghiệp] tự đăng nhập tài khoản của bạn ấy để gửi yêu cầu nhé ạ!".
  -> TUYỆT ĐỐI KHÔNG tạo action và KHÔNG gửi thẻ duyệt Telegram!

Quy định ca trực tại 5S:
1. Bác sĩ: Ca sáng (doctor-morning: 08:00 - 18:00), Ca chiều (doctor-afternoon: 10:00 - 20:00), Ca hành chính (doctor-office: 08:00 - 17:00), Ca full (doctor-full: 08:00 - 20:00).
2. Lễ tân & Phụ tá: Ca sáng (front-morning: 07:30 - 18:00), Ca chiều (front-afternoon: 09:30 - 20:00), Ca hành chính (front-office: 07:30 - 17:00), Ca full (front-full: 07:30 - 20:00).
3. Bảo vệ: security-weekday (07:00 - 20:00) / security-sunday (07:00 - 17:00).
4. Tạp vụ: cleaning-weekday (06:00 - 16:00) / cleaning-sunday (06:00 - 15:00).

Quy tắc phản hồi:
- Trả lời tối đa 2 câu, ngắn gọn, đúng trọng tâm; nếu thiếu dữ kiện thì chỉ hỏi phần còn thiếu.
- Câu hỏi về quy định không phải là yêu cầu tạo đơn. Không suy đoán ngày, giờ hoặc ca.
- Không nói đã lưu, gửi hoặc chuyển duyệt; máy chủ sẽ xác nhận sau khi ghi dữ liệu thành công.
- Luôn trả về định dạng JSON thuần túy (không kèm markdown code fence):
{
  "type": "action" | "qa",
  "reply": "Câu trả lời tiếng Việt ngắn gọn, tối đa 2 câu. Với yêu cầu đơn/công, chỉ tóm tắt dữ kiện; không nói đã lưu hoặc gửi duyệt.",
  "intent": "xin_nghi_phep" | "bo_sung_cham_cong" | "tang_ca" | "doi_ca_truc" | "hoi_dap" | "khac",
  "intentLabel": "Xin nghỉ phép" | "Bổ sung chấm công" | "Đơn tăng ca" | "Đổi ca trực" | "Hỏi đáp nội quy" | "Trò chuyện",
  "workDate": "YYYY-MM-DD hoặc null",
  "toDate": "YYYY-MM-DD hoặc null",
  "shift": "Ca sáng | Ca chiều | Ca hành chính | Ca full | null",
  "shiftCode": "Mã ca chuẩn hoặc null",
  "startTime": "HH:mm hoặc null",
  "endTime": "HH:mm hoặc null",
  "overtimeMinutes": 12 hoặc null,
  "branch": "PVC" | "LVT" | "Toàn hệ thống",
  "targetEmployeeName": "Tên đồng nghiệp nếu đổi ca hoặc bàn giao, null nếu không có",
  "reason": "Lý do tóm tắt ngắn gọn",
  "summary": "1 câu tóm tắt để gửi thẻ duyệt Telegram cho Sếp",
  "sanityCheck": "Đánh giá tính hợp lý của yêu cầu"
}`;

    let parsedResult: any = null;
    let usedAi = false;
    let usedKeyIndex = 0;

    if (keys.length > 0) {
      try {
        const input = `${recentContext ? `Lịch sử gần đây:\n${recentContext}\n\n` : ''}Tin nhắn mới nhất của nhân viên: ${JSON.stringify(rawText)}`;
        const { text, usedKeyIndex: kIdx } = await this.callGeminiWithFailover(keys, model, input, sysInstruction);
        parsedResult = JSON.parse(text);
        if (!parsedResult || typeof parsedResult !== 'object' || Array.isArray(parsedResult)) {
          throw new Error('Gemini returned an invalid response object');
        }
        usedAi = true;
        usedKeyIndex = kIdx;
        this.geminiUsageStats.successAi++;
      } catch (err: any) {
        this.logger.warn(`Gemini AI chat call failed: ${err.message}. Using smart fallback.`);
        this.geminiUsageStats.fallback++;
      }
    }

    if (!parsedResult) {
      parsedResult = this.extractSlotsFallback(pendingClarification ? `${previousRequestText} ${rawText}` : rawText, empCode, empName, empDept, empTitle);
      const isAction = parsedResult.intent !== 'khac' && parsedResult.intent !== 'hoi_dap';
      parsedResult.type = isAction ? 'action' : 'qa';
      parsedResult.reply = isAction
        ? (parsedResult.intent === 'tang_ca'
          ? `Em đã gửi yêu cầu Đơn tăng ca (${parsedResult.workDate || 'hôm nay'}, ${parsedResult.overtimeMinutes || 0} phút: ${parsedResult.startTime || ''}–${parsedResult.endTime || ''}) cho nhân sự ${parsedResult.employeeName || empName} đến Sếp duyệt qua Telegram rồi ạ!`
          : `Em đã gửi yêu cầu ${parsedResult.intentLabel} (${parsedResult.workDate || 'hôm nay'}${parsedResult.shift ? `, ${parsedResult.shift}` : ''}) cho nhân sự ${parsedResult.employeeName || empName} đến Sếp duyệt qua Telegram rồi ạ!`)
        : `Em hỗ trợ hỏi đáp nhân sự, xin nghỉ, đổi ca, bổ sung công và tăng ca. Anh/chị cần hỗ trợ nội dung nào ạ?`;
      usedAi = false;
    }

    const isActionIntent = ['xin_nghi_phep', 'bo_sung_cham_cong', 'tang_ca', 'doi_ca_truc'].includes(parsedResult.intent);
    const requestDetailsText = pendingClarification ? `${previousRequestText} ${rawText}` : rawText;
    const asksForInformation = /(quy định|như thế nào|thế nào|là gì|hướng dẫn|bao nhiêu|có được|được không)/i.test(rawText);
    const directRequest = /(xin|đăng ký|báo|gửi đơn|tạo đơn|bổ sung|quên chấm|quên check|đổi ca|đổi lịch|trực thay|tăng ca|làm thêm|nghỉ phép|nghỉ ốm)/i.test(rawText);
    const explicitRequest = !asksForInformation && (directRequest || pendingClarification);
    const explicitDate = /(hôm nay|hôm qua|ngày mai|ngày mốt|ngày\s*\d{1,2}\b|\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b)/i.test(requestDetailsText);
    const explicitTimes = requestDetailsText.match(/\b(?:[01]?\d|2[0-3])\s*(?::\s*[0-5]\d|h(?:\s*[0-5]?\d)?|giờ(?:\s*[0-5]?\d)?)/gi) || [];
    const validDate = (value: unknown) => {
      const date = String(value || '');
      return /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)
        && new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;
    };
    const validTime = (value: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
    const missing: string[] = [];
    if (parsedResult.type === 'action') {
      if (!isActionIntent || !explicitRequest) missing.push('nêu rõ yêu cầu cần gửi');
      if (!explicitDate || !validDate(parsedResult.workDate)) missing.push('ngày cần áp dụng');
      if (parsedResult.intent === 'tang_ca' || parsedResult.intent === 'bo_sung_cham_cong') {
        if (explicitTimes.length < 2 || !validTime(parsedResult.startTime) || !validTime(parsedResult.endTime)) {
          missing.push('đầy đủ giờ bắt đầu và kết thúc');
        } else {
          let [startHour, startMinute] = parsedResult.startTime.split(':').map(Number);
          let [endHour, endMinute] = parsedResult.endTime.split(':').map(Number);
          // Tự động hoán vị nếu giờ bị đảo ngược
          if (startHour * 60 + startMinute > endHour * 60 + endMinute) {
            const temp = parsedResult.startTime;
            parsedResult.startTime = parsedResult.endTime;
            parsedResult.endTime = temp;
            [startHour, startMinute] = parsedResult.startTime.split(':').map(Number);
            [endHour, endMinute] = parsedResult.endTime.split(':').map(Number);
          }
          const duration = endHour * 60 + endMinute - startHour * 60 - startMinute;
          if (duration <= 0) missing.push('khoảng giờ bắt đầu và kết thúc hợp lệ');
          else if (parsedResult.intent === 'tang_ca') {
            if (duration > 16 * 60) missing.push('khoảng giờ tăng ca hợp lệ');
            else parsedResult.overtimeMinutes = duration;
          }
        }
      }
      if (parsedResult.intent === 'xin_nghi_phep' && parsedResult.toDate
        && (!validDate(parsedResult.toDate) || parsedResult.toDate < parsedResult.workDate)) {
        missing.push('ngày kết thúc hợp lệ sau ngày bắt đầu');
      }
      if (parsedResult.intent === 'doi_ca_truc'
        && (!parsedResult.targetEmployeeName || !(parsedResult.shiftCode || parsedResult.shift))) {
        missing.push('tên người đổi ca và ca muốn đổi');
      }
    }
    if (parsedResult.type === 'action' && missing.length) {
      parsedResult.type = 'qa';
      parsedResult.intent = 'hoi_dap';
      parsedResult.intentLabel = 'Cần bổ sung thông tin';
      parsedResult.reply = `Em chưa gửi đơn để tránh ghi sai. Vui lòng bổ sung ${[...new Set(missing)].join(', ')} trong một tin nhắn nhé.`;
    } else if (parsedResult.type !== 'action' || !isActionIntent) {
      parsedResult.type = 'qa';
      parsedResult.intent = isActionIntent ? parsedResult.intent : 'hoi_dap';
    }

    // Guardrail nghiêm ngặt: Tuyệt đối không cho phép tạo đơn hộ (chấm công hộ, tăng ca hộ, nghỉ phép hộ).
    // Mỗi tài khoản chỉ phục vụ dữ liệu của chính người đó.
    if (parsedResult.type === 'action' && ['xin_nghi_phep', 'bo_sung_cham_cong', 'tang_ca'].includes(parsedResult.intent)) {
      const targetName = String(parsedResult.targetEmployeeName || '').trim();
      const currentName = empName.toLowerCase();
      const currentCode = empCode.toLowerCase();

      let isProxy = Boolean(targetName && !currentName.includes(targetName.toLowerCase()) && !currentCode.includes(targetName.toLowerCase()));

      if (!isProxy) {
        const lowerPrompt = requestDetailsText.toLowerCase();
        const proxyPatterns = ['chấm hộ', 'chấm công hộ', 'tăng ca hộ', 'xin nghỉ hộ', 'nghỉ hộ', 'báo tăng ca hộ', 'đăng ký hộ'];
        if (proxyPatterns.some((pat) => lowerPrompt.includes(pat))) {
          isProxy = true;
        } else {
          try {
            const allProfiles = await this.infrastructure.postgres.query<{ name: string; code: string }>(
              `select payload->>'full_name' as name, payload->>'employee_code' as code from app.records where (entity_type='profiles' or entity_type='employees') and deleted_at is null`,
            );
            for (const row of allProfiles.rows) {
              const pCode = String(row.code || '').trim().toLowerCase();
              const pName = String(row.name || '').trim().toLowerCase();
              const pLastName = pName.split(/\s+/).pop() || '';
              if (pCode && pCode !== currentCode && pLastName.length >= 2 && !currentName.includes(pLastName)) {
                const regexStart = new RegExp(`^(nhân sự\\s+|bạn\\s+|chị\\s+|anh\\s+|em\\s+)?(${pLastName}|${pCode})\\s+(tăng ca|nghỉ|chấm công|đi làm|vào ca|ra ca)`, 'i');
                const regexFor = new RegExp(`(tăng ca|nghỉ|chấm công|bổ sung công)\\s+(cho|hộ|giúp)\\s+(${pLastName}|${pCode})`, 'i');
                if (regexStart.test(lowerPrompt) || regexFor.test(lowerPrompt)) {
                  isProxy = true;
                  parsedResult.targetEmployeeName = row.name;
                  break;
                }
              }
            }
          } catch {}
        }
      }

      if (isProxy) {
        parsedResult.type = 'qa';
        parsedResult.intent = 'hoi_dap';
        parsedResult.intentLabel = 'Từ chối làm hộ';
        const otherPerson = parsedResult.targetEmployeeName ? ` cho ${parsedResult.targetEmployeeName}` : ' hộ nhân sự khác';
        parsedResult.reply = `Dạ theo quy tắc bảo mật và quản trị dữ liệu của hệ thống Nha khoa 5S, mỗi tài khoản chỉ phục vụ ghi nhận dữ liệu cho chính nhân sự đó, không được phép tạo đơn hay can thiệp dữ liệu${otherPerson} ạ. Nhờ anh/chị nhắn đồng nghiệp tự đăng nhập tài khoản của bạn ấy để gửi yêu cầu nhé!`;
      }
    }

    if (parsedResult.shiftCode || parsedResult.shift) {
      const shiftObj = this.resolveClinicShift(parsedResult.shiftCode || parsedResult.shift, empCode, empDept, empTitle);
      parsedResult.shiftCode = shiftObj.code;
      parsedResult.shift = shiftObj.name;
      if (!parsedResult.startTime) parsedResult.startTime = shiftObj.start;
      if (!parsedResult.endTime) parsedResult.endTime = shiftObj.end;
    }

    // Đảm bảo không bị đảo giờ và thời lượng chuẩn
    if (parsedResult.startTime && parsedResult.endTime) {
      const [sh, sm] = String(parsedResult.startTime).split(':').map(Number);
      const [eh, em] = String(parsedResult.endTime).split(':').map(Number);
      if (Number.isFinite(sh) && Number.isFinite(eh) && (sh * 60 + sm > eh * 60 + em)) {
        const tmp = parsedResult.startTime;
        parsedResult.startTime = parsedResult.endTime;
        parsedResult.endTime = tmp;
      }
      if (parsedResult.intent === 'tang_ca') {
        const [nsh, nsm] = String(parsedResult.startTime).split(':').map(Number);
        const [neh, nem] = String(parsedResult.endTime).split(':').map(Number);
        parsedResult.overtimeMinutes = Math.max(0, (neh * 60 + nem) - (nsh * 60 + nsm));
      }
    }

    parsedResult.requestId = `req_${Date.now()}`;
    parsedResult.processingTimeMs = Date.now() - startTime;
    parsedResult.model = usedAi ? model : 'Smart Semantic Fallback';
    parsedResult.usedAi = usedAi;
    parsedResult.keyIndex = usedKeyIndex + 1;
    parsedResult.employeeCode = empCode;
    parsedResult.employeeName = empName;
    parsedResult.department = empDept;
    parsedResult.title = empTitle;
    parsedResult.branch = parsedResult.branch || branch;

    let telegramSent = false;
    let createdRecordId = '';

    if (parsedResult.type === 'action' && ['xin_nghi_phep', 'bo_sung_cham_cong', 'tang_ca', 'doi_ca_truc'].includes(parsedResult.intent)) {
      try {
        if (parsedResult.intent === 'xin_nghi_phep' || parsedResult.intent === 'tang_ca') {
          const isTangCa = parsedResult.intent === 'tang_ca';
          const overtimeMins = Number(parsedResult.overtimeMinutes) || 0;
          const recordId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records (entity_type, record_key, payload, origin, updated_at)
             values ('leave_requests', $1, $2::jsonb, 'vps', now())`,
            [recordId, JSON.stringify({
              id: recordId,
              employee_code: empCode,
              request_type: isTangCa ? 'Đơn tăng ca' : (parsedResult.intentLabel === 'Xin nghỉ phép' || parsedResult.intent === 'xin_nghi_phep' ? 'Đơn nghỉ phép' : (parsedResult.intentLabel || 'Đơn nghỉ phép')),
              from_date: parsedResult.workDate || today,
              to_date: parsedResult.toDate || parsedResult.workDate || today,
              request_start_time: parsedResult.startTime ? (parsedResult.startTime.length === 5 ? `${parsedResult.startTime}:00` : parsedResult.startTime) : null,
              request_end_time: parsedResult.endTime ? (parsedResult.endTime.length === 5 ? `${parsedResult.endTime}:00` : parsedResult.endTime) : null,
              overtime_minutes: overtimeMins,
              reason: parsedResult.reason || rawText,
              status: 'pending',
              leader_status: 'pending',
              operations_status: 'pending',
              routed_to: 'leader',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ai_assisted: true,
              ai_request_id: parsedResult.requestId,
            })],
          );
          createdRecordId = recordId;
          await this.infrastructure.markDataChanged(['leave_requests'], user.id, user.role);
        } else if (parsedResult.intent === 'doi_ca_truc') {
          const recordId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records (entity_type, record_key, payload, origin, updated_at)
             values ('schedule_requests', $1, $2::jsonb, 'vps', now())`,
            [recordId, JSON.stringify({
              id: recordId,
              employee_code: empCode,
              target_employee_name: parsedResult.targetEmployeeName || null,
              target_date: parsedResult.workDate || today,
              shift_code: parsedResult.shiftCode || null,
              reason: parsedResult.reason || rawText,
              status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ai_assisted: true,
              ai_request_id: parsedResult.requestId,
            })],
          );
          createdRecordId = recordId;
          await this.infrastructure.markDataChanged(['schedule_requests'], user.id, user.role);
        } else {
          await this.infrastructure.postgres.query(
            `insert into app.records (entity_type, record_key, payload, origin, updated_at)
             values ('gemini_pending_requests', $1, $2::jsonb, 'vps', now())
             on conflict (entity_type, record_key) do update set payload = excluded.payload, updated_at = now()`,
            [parsedResult.requestId, JSON.stringify(parsedResult)],
          );
          createdRecordId = parsedResult.requestId;
        }

        parsedResult.createdRecordId = createdRecordId;
        this.pendingGeminiRequests.set(parsedResult.requestId, parsedResult);

        const targetChatId = config.telegramChatId || undefined;
        const tgRes = await this.sendTelegramApprovalCard(parsedResult, targetChatId);
        if (tgRes?.sentCount > 0) telegramSent = true;
      } catch (err: any) {
        this.logger.error('Failed to create action record or notify Telegram:', err);
      }
    } else {
      this.pendingGeminiRequests.set(parsedResult.requestId, parsedResult);
    }

    if (parsedResult.type === 'action') {
      if (!createdRecordId) {
        parsedResult.type = 'qa';
        parsedResult.intent = 'hoi_dap';
        parsedResult.reply = 'Hệ thống chưa lưu được yêu cầu. Anh/chị vui lòng thử lại sau hoặc báo quản lý.';
      } else {
        const label = parsedResult.intentLabel || 'yêu cầu nhân sự';
        const otDetail = parsedResult.intent === 'tang_ca' && parsedResult.overtimeMinutes ? ` (${parsedResult.overtimeMinutes} phút: ${parsedResult.startTime}–${parsedResult.endTime})` : '';
        parsedResult.reply = telegramSent
          ? `Đã ghi nhận ${label.toLowerCase()}${otDetail} cho nhân sự ${parsedResult.employeeName} và gửi quản lý duyệt qua Telegram.`
          : `Đã lưu ${label.toLowerCase()}${otDetail} cho nhân sự ${parsedResult.employeeName}, nhưng chưa gửi được Telegram cho quản lý. Vui lòng báo quản lý kiểm tra.`;
      }
    }

    try {
      const logId = randomUUID();
      await this.infrastructure.postgres.query(
        `insert into app.records (entity_type, record_key, payload, origin, updated_at)
         values ('gemini_activity_logs', $1, $2::jsonb, 'vps', now())`,
        [logId, JSON.stringify({
          id: logId,
          request_id: parsedResult.requestId,
          created_at: new Date().toISOString(),
          employee_code: empCode,
          employee_name: empName,
          department: empDept,
          branch: parsedResult.branch,
          raw_prompt: rawText,
          intent: parsedResult.intent,
          intent_label: parsedResult.intentLabel,
          details: {
            work_date: parsedResult.workDate,
            to_date: parsedResult.toDate,
            shift: parsedResult.shift,
            shift_code: parsedResult.shiftCode,
            target_employee: parsedResult.targetEmployeeName,
            reason: parsedResult.reason,
            summary: parsedResult.summary,
            created_record_id: createdRecordId || null,
          },
          ai_reply: parsedResult.reply,
          used_ai: parsedResult.usedAi,
          model: parsedResult.model,
          latency_ms: parsedResult.processingTimeMs,
          key_index: parsedResult.keyIndex,
          telegram_notified: telegramSent,
          approval_status: parsedResult.type === 'action' ? 'pending' : 'info',
        })],
      );
    } catch (e) {
      this.logger.warn('Failed to log gemini activity:', e);
    }

    const userMsgId = randomUUID();
    const aiMsgId = randomUUID();
    const nowIso = new Date().toISOString();
    const aiTimeIso = new Date(Date.now() + 500).toISOString();

    try {
      await this.infrastructure.postgres.query(
        `insert into app.records (entity_type, record_key, payload, origin, updated_at)
         values ('messages', $1, $2::jsonb, 'vps', now())`,
        [userMsgId, JSON.stringify({
          id: userMsgId,
          channel,
          sender_id: user.id,
          recipient_id: 'ai_assistant',
          message_scope: 'direct',
          author_code: empCode,
          body: rawText,
          created_at: nowIso,
        })],
      );

      await this.infrastructure.postgres.query(
        `insert into app.records (entity_type, record_key, payload, origin, updated_at)
         values ('messages', $1, $2::jsonb, 'vps', now())`,
        [aiMsgId, JSON.stringify({
          id: aiMsgId,
          channel,
          sender_id: 'ai_assistant',
          recipient_id: user.id,
          message_scope: 'direct',
          author_code: 'AI_5S',
          body: parsedResult.reply,
          action_data: parsedResult.type === 'action' ? {
            intent: parsedResult.intent,
            intentLabel: parsedResult.intentLabel,
            workDate: parsedResult.workDate,
            shift: parsedResult.shift,
            status: 'pending',
            createdRecordId,
            telegramSent,
          } : null,
          created_at: aiTimeIso,
        })],
      );

      await this.infrastructure.markDataChanged(['messages'], user.id, user.role);
    } catch (e) {
      this.logger.warn('Failed to persist chat messages to DB:', e);
    }

    return {
      success: true,
      userMessageId: userMsgId,
      aiMessageId: aiMsgId,
      reply: parsedResult.reply,
      action: parsedResult.type === 'action' ? parsedResult : null,
      telegramSent,
      data: parsedResult,
    };
  }
}

@Controller('/api/v2/telegram')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly infrastructure: InfrastructureService,
  ) {}

  private async authenticate(req: any): Promise<AuthUser> {
    const authHeader = String(req?.headers?.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Vui lòng đăng nhập.');
    }
    const token = authHeader.slice(7);
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    const secret = process.env.APP_JWT_SECRET || '';
    if (secret.length < 32) throw new UnauthorizedException('Cấu hình hệ thống chưa hoàn tất.');
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    const result = await this.infrastructure.postgres.query<{ profile: JsonMap; employee: JsonMap | null }>(
      `select p.payload profile, e.payload employee from app.records p
       left join app.records e on e.entity_type='employees'
         and lower(e.payload->>'code')=lower(p.payload->>'employee_code') and e.deleted_at is null
       where p.entity_type='profiles' and p.record_key=$1 and p.deleted_at is null limit 1`,
      [String(payload.profileKey || '')],
    );
    const row = result.rows[0];
    if (!row || row.profile?.active === false) throw new UnauthorizedException('Tài khoản không còn hoạt động.');
    return {
      id: String(row.profile.id || payload.sub),
      email: row.employee?.email ? String(row.employee.email) : null,
      employeeCode: String(row.profile.employee_code || ''),
      branchId: String(row.profile.branch_id || ''),
      role: String(row.profile.role || 'staff'),
      department: String(row.profile.department || row.employee?.department || ''),
      profile: {
        ...row.profile,
        full_name: row.profile.full_name || row.employee?.full_name || row.employee?.name
          || row.profile.name || row.profile.display_name || row.employee?.display_name
          || row.profile.employee_code || '',
      },
    };
  }

  @Get('/health')
  health() {
    return {
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hasAdminChatId: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
    };
  }

  @Post('/webhook')
  async webhook(@Body() update: JsonMap) {
    if (update?.callback_query) {
      void this.telegram.handleCallbackQuery(update.callback_query);
      return { ok: true };
    }
    if (update?.message?.text && update?.message?.chat?.id) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const from = update.message.from;
      // Process command asynchronously
      void this.telegram.handleIncomingMessage(chatId, text, from);
    }
    return { ok: true };
  }

  @Post('/test-alert')
  async testAlert(@Req() req: any, @Body() body: { text?: string }) {
    const user = await this.authenticate(req);
    if (!['admin', 'admin_it', 'superadmin'].includes(user.role)) {
      throw new ForbiddenException('Chỉ Quản trị viên mới được gửi cảnh báo thử nghiệm.');
    }
    await this.telegram.sendSecurityAlert({
      eventType: 'server_alert',
      severity: 'info',
      actorName: String(user.profile?.full_name || user.employeeCode),
      details: { message: body.text || 'Thử nghiệm kết nối Telegram Bot thành công!' },
    });
    return { ok: true, message: 'Đã gửi thông báo thử nghiệm tới quản trị viên.' };
  }

  @Get('/gemini/config')
  async getGeminiConfig(@Req() req: any) {
    await this.authenticate(req);
    return this.telegram.getGeminiConfig();
  }

  @Post('/gemini/config')
  async saveGeminiConfig(@Req() req: any, @Body() body: JsonMap) {
    const user = await this.authenticate(req);
    if (!['admin', 'admin_it', 'superadmin'].includes(user.role)) {
      throw new ForbiddenException('Chỉ Admin-IT hoặc Quản trị cấp cao mới được chỉnh sửa cấu hình AI Gemini.');
    }
    return this.telegram.saveGeminiConfig(body);
  }

  @Post('/gemini/process')
  async processGeminiPrompt(
    @Req() req: any,
    @Body() body: { text: string; employeeCode?: string; employeeName?: string; userRole?: string },
  ) {
    if (!body?.text) throw new BadRequestException('Vui lòng nhập nội dung tin nhắn của nhân viên');
    const user = await this.authenticate(req);
    const canActForOthers = ['admin', 'admin_it', 'superadmin', 'hr', 'leader', 'phu_ta_truong'].includes(user.role);
    const employeeCode = String(canActForOthers && body.employeeCode ? body.employeeCode : user.employeeCode);
    const employeeName = String(canActForOthers && body.employeeName ? body.employeeName : (user.profile?.full_name || user.employeeCode));
    return this.telegram.processGeminiPrompt(body.text, employeeCode, employeeName, user.role);
  }

  @Post('/gemini/approve')
  async approveGeminiRequest(@Req() req: any, @Body() body: JsonMap) {
    const user = await this.authenticate(req);
    const isApprover = ['admin', 'admin_it', 'superadmin', 'hr', 'leader', 'phu_ta_truong'].includes(user.role);
    if (!isApprover) {
      throw new ForbiddenException('Chỉ Quản trị viên, Quản lý bộ phận hoặc Sếp mới có quyền phê duyệt.');
    }
    const targetEmpCode = String(body.employeeCode || '').trim();
    if (targetEmpCode.toLowerCase() === user.employeeCode.toLowerCase() && !['admin', 'admin_it', 'superadmin'].includes(user.role)) {
      throw new ForbiddenException('Bạn không thể tự duyệt yêu cầu công hoặc ca trực của chính mình.');
    }
    const approverName = `${String(user.profile?.full_name || user.employeeCode)} (${user.role})`;
    return this.telegram.approveGeminiRequest(body, approverName);
  }

  @Post('/gemini/send-telegram-card')
  async sendTelegramCard(
    @Req() req: any,
    @Body() body: { payload: JsonMap; targetChatId?: string },
  ) {
    const user = await this.authenticate(req);
    const isApprover = ['admin', 'admin_it', 'superadmin', 'hr', 'leader', 'phu_ta_truong'].includes(user.role);
    if (!isApprover) {
      throw new ForbiddenException('Chỉ Quản trị viên hoặc Quản lý mới có quyền gửi thẻ duyệt.');
    }
    return this.telegram.sendTelegramApprovalCard(body?.payload, body?.targetChatId);
  }

  @Post('/gemini/chat')
  async chatWithGemini(@Req() req: any, @Body() body: { text: string }) {
    const user = await this.authenticate(req);
    return this.telegram.processGeminiChat(user, body?.text);
  }

  @Get('/gemini/activities')
  async getGeminiActivities(@Req() req: any) {
    const user = await this.authenticate(req);
    if (!['admin', 'admin_it', 'superadmin', 'hr', 'leader'].includes(user.role)) {
      throw new ForbiddenException('Chỉ Quản trị viên và Quản lý mới có quyền xem nhật ký AI.');
    }
    return this.telegram.getGeminiActivities();
  }

  @Post('/gemini/test-keys')
  async testGeminiKeys(@Req() req: any, @Body() body: any) {
    const user = await this.authenticate(req);
    if (!['admin', 'admin_it', 'superadmin'].includes(user.role)) {
      throw new ForbiddenException('Chỉ Quản trị viên mới được kiểm tra Key AI.');
    }
    return this.telegram.testGeminiKeys(body);
  }
}

