import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';
import { SmtpConfig, SmtpService } from './smtp.service';

interface SmtpDto {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromName?: string;
  fromEmail?: string;
  testEmail?: string;
}

interface SendPayslipDto {
  smtp?: SmtpDto;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
}

interface StoredSmtp {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName?: string;
  fromEmail?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULT_FROM = 'CÔNG TY CỔ PHẦN 5S SÀI GÒN - PHÒNG NHÂN SỰ';
const SMTP_QUERY = `select payload from app.records where entity_type='system_config' and record_key='smtp' and deleted_at is null limit 1`;
const SMTP_UPSERT = `insert into app.records (entity_type, record_key, payload, origin)
  values ('system_config', 'smtp', $1::jsonb, 'vps')
  on conflict (entity_type, record_key)
  do update set payload = excluded.payload, origin = 'vps', version = app.records.version + 1, updated_at = now()`;

async function loadStoredSmtp(pg: InfrastructureService['postgres']): Promise<StoredSmtp | null> {
  try {
    const res = await pg.query<{ payload: StoredSmtp }>(SMTP_QUERY);
    return res.rows[0]?.payload || null;
  } catch { return null; }
}

// ponytail: shared across both controllers to avoid duplication
async function resolveSmtp(pg: InfrastructureService['postgres'], raw?: SmtpDto): Promise<SmtpConfig> {
  // 1. Explicit credentials from request body
  if (raw?.user?.trim() && raw?.pass?.trim() && !raw.pass.includes('••••')) {
    const h = raw.host?.trim() || 'smtp.gmail.com';
    const p = Number(raw.port || 465);
    return { host: h, port: p, secure: p === 465, user: raw.user.trim(), pass: raw.pass.trim(), fromName: raw.fromName?.trim() || DEFAULT_FROM, fromEmail: raw.fromEmail?.trim() || raw.user.trim() };
  }
  // 2. Database (configured by admin_it)
  const s = await loadStoredSmtp(pg);
  if (s?.user && s?.pass) {
    const p = Number(s.port || 465);
    return { host: s.host || 'smtp.gmail.com', port: p, secure: p === 465, user: s.user, pass: s.pass, fromName: s.fromName || DEFAULT_FROM, fromEmail: s.fromEmail || s.user };
  }
  // 3. Environment variables
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const h = process.env.SMTP_HOST || 'smtp.gmail.com';
    const p = Number(process.env.SMTP_PORT || 465);
    return { host: h, port: p, secure: p === 465, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, fromName: process.env.SMTP_FROM_NAME || DEFAULT_FROM, fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER };
  }
  throw new BadRequestException('Hệ thống chưa thiết lập SMTP gửi mail. Liên hệ Admin-IT cấu hình tại Quản Trị Hệ Thống.');
}

/* ─── System SMTP management (admin_it only) ─── */

@Controller('/api/v2/system/smtp')
@UseGuards(AuthGuard)
export class SystemSmtpController {
  constructor(private readonly smtp: SmtpService, private readonly infra: InfrastructureService) {}

  @Get()
  async get(@Req() req: { user?: AuthUser }) {
    if (!['admin', 'superadmin', 'admin_it'].includes(req.user?.role || ''))
      throw new ForbiddenException('Chỉ Admin-IT mới có quyền quản lý cấu hình SMTP.');
    const s = await loadStoredSmtp(this.infra.postgres);
    const user = s?.user || process.env.SMTP_USER || '';
    const pass = s?.pass || process.env.SMTP_PASS || '';
    return {
      ok: true,
      config: {
        host: s?.host || process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(s?.port || process.env.SMTP_PORT || 465),
        user,
        fromName: s?.fromName || process.env.SMTP_FROM_NAME || DEFAULT_FROM,
        fromEmail: s?.fromEmail || process.env.SMTP_FROM_EMAIL || user,
        isConfigured: Boolean(user && pass),
        passMasked: pass ? '••••••••••••••••' : '',
        updatedAt: s?.updatedAt,
        updatedBy: s?.updatedBy,
      },
    };
  }

  @Post()
  async save(@Req() req: { user?: AuthUser }, @Body() body: SmtpDto) {
    if (!['admin', 'superadmin', 'admin_it'].includes(req.user?.role || ''))
      throw new ForbiddenException('Chỉ Admin-IT mới có quyền cập nhật cấu hình SMTP.');
    const user = body.user?.trim();
    if (!user) throw new BadRequestException('Vui lòng cung cấp tài khoản email SMTP.');
    const existing = await loadStoredSmtp(this.infra.postgres);
    let pass = body.pass?.trim() || '';
    if (!pass || pass.includes('••••')) pass = existing?.pass || process.env.SMTP_PASS || '';
    if (!pass) throw new BadRequestException('Vui lòng nhập mật khẩu ứng dụng SMTP.');
    const cfg: StoredSmtp = {
      host: body.host?.trim() || 'smtp.gmail.com', port: Number(body.port || 465),
      user, pass, fromName: body.fromName?.trim() || DEFAULT_FROM, fromEmail: body.fromEmail?.trim() || user,
      updatedAt: new Date().toISOString(), updatedBy: req.user?.employeeCode || req.user?.email || 'admin_it',
    };
    await this.infra.postgres.query(SMTP_UPSERT, [JSON.stringify(cfg)]);
    return { ok: true, message: 'Đã lưu cấu hình SMTP hệ thống.', config: { ...cfg, pass: undefined, passMasked: '••••••••••••••••', isConfigured: true } };
  }

  @Post('/test')
  async test(@Req() req: { user?: AuthUser }, @Body() body: SmtpDto) {
    if (!['admin', 'superadmin', 'admin_it', 'hr', 'finance'].includes(req.user?.role || ''))
      throw new ForbiddenException('Bạn không có quyền kiểm tra SMTP.');
    const config = await resolveSmtp(this.infra.postgres, body);
    const result = await this.smtp.verify(config);
    if (!result.success) return result;
    if (body.testEmail?.includes('@')) {
      const mail = await this.smtp.sendMail(config, {
        to: body.testEmail.trim(),
        subject: '[5S Clinic Hub] Kiểm Tra SMTP Thành Công',
        html: `<div style="font-family:sans-serif;padding:24px;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
          <h3 style="color:#0f766e;margin-top:0;">Xác Thực SMTP Thành Công</h3>
          <p style="color:#334155;line-height:1.6;">Hệ thống <strong>5S Clinic Hub</strong> đã kết nối thành công đến máy chủ SMTP <code>${config.host}:${config.port}</code>.</p>
          <p style="color:#64748b;font-size:13px;margin-top:20px;border-top:1px solid #e2e8f0;padding-top:14px;">Email này được phát tự động từ Trung tâm Quản trị Hệ thống.</p></div>`,
      });
      if (!mail.success) return { success: false, message: `Kết nối OK nhưng gửi thử thất bại: ${mail.error || 'Lỗi gửi thư.'}` };
      return { success: true, message: `Đã gửi thư thử nghiệm đến ${body.testEmail.trim()} thành công.` };
    }
    return result;
  }
}

/* ─── Payroll dispatch (HR/Finance/Admin) ─── */

@Controller('/api/v2/payroll')
export class PayrollController {
  constructor(private readonly smtp: SmtpService, private readonly infra: InfrastructureService) {}

  @Get('/smtp-status')
  @UseGuards(AuthGuard)
  async smtpStatus(@Req() req: { user?: AuthUser }) {
    if (!['admin', 'superadmin', 'hr', 'finance'].includes(req.user?.role || ''))
      throw new ForbiddenException('Bạn không có quyền kiểm tra trạng thái SMTP.');
    const s = await loadStoredSmtp(this.infra.postgres);
    const user = s?.user || process.env.SMTP_USER || '';
    const pass = s?.pass || process.env.SMTP_PASS || '';
    return { ok: true, isConfigured: Boolean(user && pass), senderEmail: user, fromName: s?.fromName || process.env.SMTP_FROM_NAME || DEFAULT_FROM };
  }

  @Post('/test-smtp')
  @UseGuards(AuthGuard)
  async testSmtp(@Req() req: { user?: AuthUser }, @Body() body: SmtpDto) {
    if (!['admin', 'superadmin', 'hr', 'finance'].includes(req.user?.role || ''))
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    const config = await resolveSmtp(this.infra.postgres, body);
    return this.smtp.verify(config);
  }

  @Post('/send-payslip')
  @UseGuards(AuthGuard)
  async sendPayslip(@Req() req: { user?: AuthUser }, @Body() body: SendPayslipDto) {
    if (!['admin', 'superadmin', 'hr', 'finance'].includes(req.user?.role || ''))
      throw new ForbiddenException('Bạn không có quyền gửi phiếu lương.');
    if (!body.to?.includes('@')) throw new BadRequestException('Địa chỉ email người nhận không hợp lệ.');
    if (!body.subject) throw new BadRequestException('Tiêu đề thư không được để trống.');
    if (!body.html) throw new BadRequestException('Nội dung phiếu lương không được để trống.');
    const config = await resolveSmtp(this.infra.postgres, body.smtp);
    const result = await this.smtp.sendMail(config, {
      to: body.to.trim(),
      subject: body.subject.trim(),
      html: body.html,
      text: body.text,
    });
    if (!result.success) throw new BadRequestException(result.error || 'Gửi thư thất bại.');
    return { success: true, messageId: result.messageId, to: body.to.trim() };
  }
}
