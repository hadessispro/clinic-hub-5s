import { BadGatewayException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from './auth';

@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  @Post('signed-upload')
  async signedUpload(@Req() request: Request & { accessToken?: string }, @Body() body: { bucket?: string; path?: string }) {
    const bucket = String(body.bucket || 'attachments');
    const path = String(body.path || '').replace(/^\/+/, '');
    if (!/^[a-z0-9_-]+$/i.test(bucket) || !path || path.includes('..')) throw new BadGatewayException('Đường dẫn tệp không hợp lệ.');
    const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) throw new BadGatewayException('Máy chủ chưa cấu hình Storage.');
    const response = await fetch(`${base}/storage/v1/object/upload/sign/${bucket}/${encodeURI(path)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) throw new BadGatewayException('Không thể tạo URL tải tệp.');
    return response.json();
  }
}
