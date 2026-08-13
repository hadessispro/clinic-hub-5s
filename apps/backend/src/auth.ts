import { CanActivate, Controller, ExecutionContext, Get, Injectable, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

type AuthenticatedRequest = Request & { user?: Record<string, unknown>; accessToken?: string };

@Injectable()
export class AuthService {
  async authenticate(header?: string) {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('Thiếu access token.');
    const supabaseUrl = process.env.SUPABASE_URL;
    const apiKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !apiKey) throw new UnauthorizedException('Máy chủ chưa cấu hình Supabase Auth.');
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: apiKey },
    });
    if (!response.ok) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return { user: await response.json() as Record<string, unknown>, token };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const result = await this.auth.authenticate(request.headers.authorization);
    request.user = result.user;
    request.accessToken = result.token;
    return true;
  }
}

@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  @Get('me') me(@Req() request: AuthenticatedRequest) { return request.user; }
}
