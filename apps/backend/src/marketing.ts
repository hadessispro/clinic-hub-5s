import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth';
import { InfrastructureService } from './infrastructure';

@Controller('marketing')
@UseGuards(AuthGuard)
export class MarketingController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('leads')
  async getLeads(@Query('branch_id') branchId?: string, @Query('status') status?: string) {
    let sql = 'SELECT * FROM marketing_leads';
    const conditions: string[] = [];
    const params: any[] = [];

    if (branchId) {
      params.push(branchId);
      conditions.push(`branch_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const result = await this.infrastructure.pg.query(sql, params);
    return result.rows;
  }

  @Post('leads')
  async createLead(@Body() body: any) {
    const { full_name, phone, email, source, campaign_name, branch_id, service_interest, assigned_telesale_id, notes } = body;
    const sql = `
      INSERT INTO marketing_leads 
      (full_name, phone, email, source, campaign_name, branch_id, service_interest, assigned_telesale_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const params = [
      full_name,
      phone,
      email || '',
      source || 'Facebook Ads',
      campaign_name || 'Chiến dịch MKT',
      branch_id || 'le-van-tho',
      service_interest || 'Tư vấn tổng quát',
      assigned_telesale_id || null,
      notes || ''
    ];

    const result = await this.infrastructure.pg.query(sql, params);
    return result.rows[0];
  }

  @Patch('leads/:id')
  async updateLead(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const allowed = ['full_name', 'phone', 'email', 'source', 'campaign_name', 'branch_id', 'service_interest', 'assigned_telesale_id', 'notes', 'status'];
    const keys = allowed.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (!keys.length) throw new BadRequestException('Không có trường hợp lệ để cập nhật.');
    const set = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const result = await this.infrastructure.pg.query(
      `UPDATE marketing_leads SET ${set}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...keys.map((key) => body[key]), id],
    );
    return result.rows[0] || null;
  }

  @Delete('leads/:id')
  async deleteLead(@Param('id') id: string) {
    const result = await this.infrastructure.pg.query('DELETE FROM marketing_leads WHERE id = $1 RETURNING id', [id]);
    return { deleted: result.rowCount === 1, id };
  }

  @Post('call-logs')
  async addCallLog(@Body() body: any) {
    const { lead_id, telesale_id, call_status, note, appointment_date } = body;
    const sql = `
      INSERT INTO telesale_call_logs 
      (lead_id, telesale_id, call_status, note, appointment_date)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const params = [lead_id, telesale_id, call_status, note || '', appointment_date || null];
    const result = await this.infrastructure.pg.query(sql, params);

    // Update lead status
    let leadStatus = 'contacted';
    if (call_status === 'appointment_booked') leadStatus = 'appointment_booked';
    else if (call_status === 'rejected') leadStatus = 'cancelled';

    await this.infrastructure.pg.query(
      'UPDATE marketing_leads SET status = $1, updated_at = NOW() WHERE id = $2',
      [leadStatus, lead_id]
    );

    return result.rows[0];
  }

  @Get('campaigns')
  async getCampaigns() {
    const result = await this.infrastructure.pg.query(
      'SELECT * FROM marketing_campaigns ORDER BY created_at DESC'
    );
    return result.rows;
  }

  @Post('campaigns')
  async createCampaign(@Body() body: Record<string, unknown>) {
    const result = await this.infrastructure.pg.query(
      `INSERT INTO marketing_campaigns (name, channel, budget, spent, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [body.name, body.channel, body.budget || 0, body.spent || 0, body.start_date || null, body.end_date || null, body.status || 'active'],
    );
    return result.rows[0];
  }
}
