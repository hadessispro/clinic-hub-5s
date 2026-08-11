import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
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
}
