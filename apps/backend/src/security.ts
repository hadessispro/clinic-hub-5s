import { BadRequestException, Body, Controller, Get, Injectable, Logger, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthService, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';
import { SecurityAlertPayload, TelegramService } from './telegram';

type JsonMap = Record<string, any>;

function extractClientIp(req: any): string {
  const cfIp = req.headers?.['cf-connecting-ip'];
  if (cfIp) return String(cfIp).trim();
  const xForwarded = req.headers?.['x-forwarded-for'];
  if (xForwarded) return String(xForwarded).split(',')[0].trim();
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly infrastructure: InfrastructureService,
    private readonly telegram: TelegramService,
  ) {}

  async recordEvent(event: SecurityAlertPayload): Promise<void> {
    try {
      await this.infrastructure.postgres.query(
        `insert into app.security_events
           (event_type, severity, actor_code, actor_name, actor_role, branch_id, client_ip, user_agent, details)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          event.eventType,
          event.severity,
          event.actorCode || null,
          event.actorName || null,
          event.actorRole || null,
          event.branchId || null,
          event.clientIp || null,
          event.userAgent || null,
          JSON.stringify(event.details || {}),
        ],
      );
    } catch (error) {
      this.logger.error('Failed to insert security event:', error);
    }

    // Always dispatch warnings and critical events to Telegram
    if (event.severity === 'critical' || event.severity === 'warning') {
      void this.telegram.sendSecurityAlert(event);
    }
  }

  async handleClientTamper(
    clientIp: string,
    userAgent: string,
    body: {
      type?: string;
      actorCode?: string;
      actorName?: string;
      branchId?: string;
      actorRole?: string;
      details?: JsonMap;
    },
    userFromAuth?: AuthUser,
  ) {
    const isF12 = body.type === 'f12_opened' || body.type === 'devtools_opened';
    const eventType = isF12 ? 'f12_opened' : 'console_tamper';
    const severity = isF12 ? 'warning' : 'critical';

    const actorCode = userFromAuth?.employeeCode || body.actorCode || '';
    const actorName = (userFromAuth?.profile?.full_name as string) || body.actorName || '';
    const actorRole = userFromAuth?.role || body.actorRole || '';
    const branchId = userFromAuth?.branchId || body.branchId || '';

    await this.recordEvent({
      eventType,
      severity,
      actorCode,
      actorName,
      actorRole,
      branchId,
      clientIp,
      userAgent,
      details: {
        action: body.type || 'tamper_detected',
        ...body.details,
      },
    });

    return { ok: true };
  }

  async getRecentAlerts(limit = 20) {
    const res = await this.infrastructure.postgres.query(
      `select id, event_type, severity, actor_code, actor_name, actor_role, branch_id, client_ip, details, created_at
       from app.security_events
       order by created_at desc
       limit $1`,
      [Math.min(limit, 100)],
    );
    return res.rows;
  }
}

@Controller('/api/v2/security')
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly auth: AuthService,
  ) {}

  @Post('/client-tamper')
  async reportClientTamper(@Req() req: any, @Body() body: JsonMap) {
    const clientIp = extractClientIp(req);
    const userAgent = String(req.headers?.['user-agent'] || '');

    // Try extracting authenticated user from authorization header if present
    let user: AuthUser | undefined;
    const authHeader = String(req.headers?.authorization || '');
    if (authHeader.startsWith('Bearer ')) {
      try {
        user = await this.auth.userFromToken(authHeader.slice(7));
      } catch {
        // Token might be invalid or expired; proceed with unauthenticated data from body
      }
    }

    return this.security.handleClientTamper(clientIp, userAgent, body, user);
  }

  @Get('/alerts')
  @UseGuards(AuthGuard)
  async getAlerts(@Req() req: { user: AuthUser }, @Query('limit') limitQuery?: string) {
    if (!['admin', 'admin_it', 'superadmin'].includes(req.user.role)) {
      throw new BadRequestException('Chỉ quản trị viên mới có quyền xem nhật ký an ninh.');
    }
    const limit = Number(limitQuery) || 20;
    return this.security.getRecentAlerts(limit);
  }
}
