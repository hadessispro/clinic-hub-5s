import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from './auth';
import { InfrastructureService } from './infrastructure';

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('mine')
  async mine(@Req() request: Request & { user?: { id?: string } }) {
    const result = await this.infrastructure.pg.query('SELECT * FROM attendance_records WHERE created_by = $1 ORDER BY recorded_at DESC LIMIT 100', [request.user?.id]);
    return result.rows;
  }

  @Post()
  async record(@Req() request: Request & { user?: { id?: string } }, @Body() body: Record<string, unknown>) {
    const recordType = ['checkout', 'check_out'].includes(String(body.action || body.record_type))
      ? 'checkout' : ['checkin', 'check_in'].includes(String(body.action || body.record_type)) ? 'checkin' : null;
    if (!recordType) throw new BadRequestException('Hành động chấm công không hợp lệ.');
    const result = await this.infrastructure.pg.query(
      `INSERT INTO attendance_records (employee_code, shift_code, record_type, lat, lng, accuracy_m, recorded_at, created_by, device_id, captured_offline)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9) RETURNING *`,
      [body.employee_code, body.shift_code || null, recordType, body.latitude ?? body.lat, body.longitude ?? body.lng,
        body.accuracy ?? body.accuracy_m, request.user?.id, body.device_id || 'nestjs-vps', Boolean(body.captured_offline)],
    );
    return result.rows[0];
  }
}
