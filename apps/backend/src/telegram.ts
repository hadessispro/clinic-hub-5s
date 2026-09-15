import * as os from 'node:os';
import * as fs from 'node:fs';
import { BadRequestException, Body, Controller, Get, Injectable, Logger, Post, Req } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, any>;

export interface SecurityAlertPayload {
  eventType: 'login_success' | 'login_failed' | 'logout' | 'f12_opened' | 'console_tamper' | 'gps_anomaly' | 'suspicious_activity' | 'server_alert';
  eventId?: string | number;
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

  async sendRawMessage(chatId: string, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    const token = this.botToken;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not configured; message skipped.');
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
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

  async sendSecurityAlert(alert: SecurityAlertPayload): Promise<void> {
    const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    const severityLabel = alert.severity === 'critical' ? 'NGHIÊM TRỌNG' : alert.severity === 'warning' ? 'CẢNH BÁO' : 'THÔNG TIN';

    let eventTitle = 'Sự kiện an ninh';
    if (alert.eventType === 'f12_opened') eventTitle = 'PHÁT HIỆN MỞ F12 / DEVTOOLS';
    else if (alert.eventType === 'console_tamper') eventTitle = 'CAN THIỆP MÃ NGUỒN TRỰC TIẾP TRÊN CONSOLE';
    else if (alert.eventType === 'login_failed') eventTitle = 'ĐĂNG NHẬP THẤT BẠI NHIỀU LẦN';
    else if (alert.eventType === 'login_success') eventTitle = 'ĐĂNG NHẬP HỆ THỐNG';
    else if (alert.eventType === 'logout') eventTitle = 'ĐĂNG XUẤT HỆ THỐNG';
    else if (alert.eventType === 'gps_anomaly') eventTitle = 'CHẤM CÔNG GPS BẤT THƯỜNG';
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

      // 3. Security events today
      const secRes = await this.infrastructure.postgres.query<{ event_type: string; count: string }>(
        `select event_type, count(*) as count from app.security_events
         where created_at::date = $1::date
         group by event_type`,
        [today],
      );
      if (secRes.rows.length > 0) {
        securitySummary = secRes.rows.map((r) => `  • <code>${r.event_type}</code>: ${r.count} sự kiện`).join('\n');
      }
    } catch (e: any) {
      this.logger.error('Error fetching daily report data:', e);
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
      `🛡️ <b>Tình hình an ninh & kiểm soát:</b>`,
      securitySummary,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🤖 <i>Clinic Hub 5S Automated Security & Operations Sentinel</i>`,
    ].join('\n');
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
}

@Controller('/api/v2/telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('/health')
  health() {
    return {
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hasAdminChatId: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
    };
  }

  @Post('/webhook')
  async webhook(@Body() update: JsonMap) {
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
  async testAlert(@Body() body: { text?: string }) {
    await this.telegram.sendSecurityAlert({
      eventType: 'server_alert',
      severity: 'info',
      actorName: 'Hệ thống kiểm thử',
      details: { message: body.text || 'Thử nghiệm kết nối Telegram Bot thành công!' },
    });
    return { ok: true, message: 'Đã gửi thông báo thử nghiệm tới quản trị viên.' };
  }
}
