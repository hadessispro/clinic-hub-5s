import { createHash } from 'node:crypto';
import { BadRequestException, Body, Controller, Delete, Get, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

// web-push ships CommonJS and is intentionally kept behind this VPS-only controller.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require('web-push') as any;
type JsonMap = Record<string, any>;

export interface PushPayload {
  title: string;
  body: string;
  view?: string;
  url?: string;
  id?: string;
}

@Injectable()
export class PushService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; disabled?: boolean }> {
    if (!userId) return { sent: 0 };
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    const privateKey = process.env.VAPID_PRIVATE_KEY || '';
    if (!publicKey || !privateKey) return { sent: 0, disabled: true };

    try {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@nhakhoa5s.vn', publicKey, privateKey);
    } catch {
      return { sent: 0, disabled: true };
    }

    // Giai đoạn thử nghiệm cô lập an toàn trên Production: Chỉ cho phép gửi tới tài khoản admin_it
    const profileCheck = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type='profiles' and deleted_at is null and payload->>'id'=$1 limit 1`,
      [String(userId)],
    );
    const userRole = profileCheck.rows[0]?.payload?.role;
    if (userRole !== 'admin_it') {
      return { sent: 0 };
    }

    const subscriptions = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
      `select record_key,payload from app.records where entity_type='push_subscriptions' and deleted_at is null
       and payload->>'user_id'=$1 and coalesce((payload->>'active')::boolean,true)=true`,
      [String(userId)],
    );

    let sent = 0;
    const bodyText = JSON.stringify({
      title: payload.title || '5S Clinic Hub',
      body: payload.body || '',
      id: payload.id || `push-${Date.now()}`,
      view: payload.view || 'dashboard',
      url: payload.url || '/',
    });

    for (const row of subscriptions.rows) {
      try {
        await webpush.sendNotification({
          endpoint: row.payload.endpoint,
          keys: { p256dh: row.payload.p256dh, auth: row.payload.auth_key },
        }, bodyText);
        sent += 1;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await this.infrastructure.postgres.query(
            `update app.records set payload=jsonb_set(payload,'{active}','false'::jsonb),origin='vps',version=version+1,updated_at=now()
             where entity_type='push_subscriptions' and record_key=$1`,
            [row.record_key],
          );
        }
      }
    }
    return { sent };
  }

  async sendToEmployee(employeeCode: string, payload: PushPayload): Promise<{ sent: number; disabled?: boolean }> {
    if (!employeeCode) return { sent: 0 };
    const profileResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type='profiles' and deleted_at is null and lower(payload->>'employee_code')=lower($1) limit 1`,
      [employeeCode],
    );
    const profile = profileResult.rows[0]?.payload;
    if (!profile?.id) return { sent: 0 };
    return this.sendToUser(String(profile.id), payload);
  }
}

@Controller('/api/v2')
@UseGuards(AuthGuard)
export class PushController {
  constructor(
    private readonly infrastructure: InfrastructureService,
    private readonly pushService: PushService,
  ) {}

  @Get('/push-subscription')
  config() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || '' };
  }

  @Post('/push-subscription')
  async subscribe(@Req() request: { user: AuthUser; headers: Record<string, string | undefined> }, @Body() body: JsonMap) {
    const endpoint = String(body.endpoint || '').slice(0, 4000);
    const p256dh = String(body.keys?.p256dh || '').slice(0, 1000);
    const authKey = String(body.keys?.auth || '').slice(0, 1000);
    if (!endpoint || !p256dh || !authKey) throw new BadRequestException('Đăng ký thông báo không hợp lệ.');
    const id = createHash('sha256').update(endpoint).digest('hex');
    const payload = {
      id,
      user_id: request.user.id,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: String(request.headers['user-agent'] || '').slice(0, 500),
      active: true,
      updated_at: new Date().toISOString(),
    };
    await this.infrastructure.postgres.query(
      `insert into app.records(entity_type,record_key,payload,origin) values ('push_subscriptions',$1,$2::jsonb,'vps')
       on conflict (entity_type,record_key) do update set payload=excluded.payload,origin='vps',deleted_at=null,version=app.records.version+1,updated_at=now()`,
      [id, JSON.stringify(payload)],
    );
    return { ok: true };
  }

  @Delete('/push-subscription')
  async unsubscribe(@Req() request: { user: AuthUser }, @Body() body: JsonMap) {
    const endpoint = String(body.endpoint || '');
    await this.infrastructure.postgres.query(
      `update app.records set payload=jsonb_set(payload,'{active}','false'::jsonb),origin='vps',version=version+1,updated_at=now()
       where entity_type='push_subscriptions' and deleted_at is null and payload->>'endpoint'=$1 and payload->>'user_id'=$2`,
      [endpoint, request.user.id],
    );
    return { ok: true };
  }

  @Post('/push-dispatch')
  async dispatch(@Body() body: { notificationId?: string }) {
    const id = String(body.notificationId || '');
    const notificationResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type='notifications' and deleted_at is null and payload->>'id'=$1 limit 1`,
      [id],
    );
    const notification = notificationResult.rows[0]?.payload;
    if (!notification) throw new BadRequestException('Không tìm thấy thông báo.');

    return this.pushService.sendToUser(String(notification.user_id || ''), {
      title: notification.title || 'Clinic Hub',
      body: notification.body || '',
      id: notification.id || '',
      view: notification.link_view || 'dashboard',
      url: '/',
    });
  }

  @Post('/push-test')
  async testPush(@Req() request: { user: AuthUser }) {
    const result = await this.pushService.sendToUser(request.user.id, {
      title: '🔔 Thử nghiệm chuông thông báo · 5S Clinic',
      body: 'Thiết bị của bạn đã kết nối thành công với hệ thống thông báo đẩy! Bạn sẽ nhận được nhắc chấm công, nhắc checkout và tin nhắn ngay cả khi PWA đang đóng.',
      view: 'dashboard',
      url: '/',
    });
    return { ok: true, sent: result.sent };
  }
}
