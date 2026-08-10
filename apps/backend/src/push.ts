import { createHash } from 'node:crypto';
import { BadRequestException, Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

// web-push ships CommonJS and is intentionally kept behind this VPS-only controller.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require('web-push') as any;
type JsonMap = Record<string, any>;

@Controller('/api/v2')
@UseGuards(AuthGuard)
export class PushController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/push-subscription')
  config() { return { publicKey: process.env.VAPID_PUBLIC_KEY || '' }; }

  @Post('/push-subscription')
  async subscribe(@Req() request: { user: AuthUser; headers: Record<string, string | undefined> }, @Body() body: JsonMap) {
    const endpoint = String(body.endpoint || '').slice(0, 4000);
    const p256dh = String(body.keys?.p256dh || '').slice(0, 1000);
    const authKey = String(body.keys?.auth || '').slice(0, 1000);
    if (!endpoint || !p256dh || !authKey) throw new BadRequestException('Đăng ký thông báo không hợp lệ.');
    const id = createHash('sha256').update(endpoint).digest('hex');
    const payload = { id, user_id: request.user.id, endpoint, p256dh, auth_key: authKey,
      user_agent: String(request.headers['user-agent'] || '').slice(0, 500), active: true, updated_at: new Date().toISOString() };
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
      `select payload from app.records where entity_type='notifications' and deleted_at is null and payload->>'id'=$1 limit 1`, [id],
    );
    const notification = notificationResult.rows[0]?.payload;
    if (!notification) throw new BadRequestException('Không tìm thấy thông báo.');
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    const privateKey = process.env.VAPID_PRIVATE_KEY || '';
    if (!publicKey || !privateKey) return { sent: 0, disabled: true };
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@localhost', publicKey, privateKey);
    const subscriptions = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
      `select record_key,payload from app.records where entity_type='push_subscriptions' and deleted_at is null
       and payload->>'user_id'=$1 and coalesce((payload->>'active')::boolean,true)=true`, [String(notification.user_id || '')],
    );
    let sent = 0;
    for (const row of subscriptions.rows) {
      try {
        await webpush.sendNotification({ endpoint: row.payload.endpoint,
          keys: { p256dh: row.payload.p256dh, auth: row.payload.auth_key } }, JSON.stringify({
          title: notification.title || 'Clinic Hub', body: notification.body || '', id: notification.id || '',
          view: notification.link_view || 'dashboard', url: '/',
        }));
        sent += 1;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await this.infrastructure.postgres.query(
            `update app.records set payload=jsonb_set(payload,'{active}','false'::jsonb),origin='vps',version=version+1,updated_at=now()
             where entity_type='push_subscriptions' and record_key=$1`, [row.record_key],
          );
        }
      }
    }
    return { sent };
  }
}
