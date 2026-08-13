import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth';
import { InfrastructureService } from './infrastructure';

const TABLES = new Set([
  'employees', 'profiles', 'tasks', 'messages', 'notifications', 'attendance_records',
  'leave_requests', 'schedule_requests', 'schedule_assignments', 'monthly_schedules',
  'incidents', 'assets', 'inventory_items', 'inventory_logs', 'purchase_requests',
  'uniform_logs', 'proposals', 'recruitment_candidates', 'onboarding_documents',
  'onboarding_progress', 'performance_metrics', 'payroll_feedbacks', 'clinic_settings',
  'marketing_leads', 'marketing_campaigns', 'telesale_call_logs',
]);
const COLUMN = /^[a-z][a-z0-9_]*$/;

function tableName(value: string) {
  if (!TABLES.has(value)) throw new BadRequestException('Bảng dữ liệu không được phép.');
  return value;
}
function safeKeys(body: Record<string, unknown>) {
  const keys = Object.keys(body).filter((key) => COLUMN.test(key) && key !== 'id');
  if (!keys.length) throw new BadRequestException('Không có trường dữ liệu hợp lệ.');
  return keys;
}

@Injectable()
export class DataService {
  constructor(private readonly infrastructure: InfrastructureService) {}
  list(table: string, branch?: string) {
    const name = tableName(table);
    return this.infrastructure.pg.query(
      `SELECT * FROM ${name}${branch ? ' WHERE branch_id = $1' : ''} LIMIT 1000`,
      branch ? [branch] : [],
    ).then((result) => result.rows);
  }
  create(table: string, body: Record<string, unknown>) {
    const name = tableName(table); const keys = safeKeys(body);
    const fields = keys.join(', '); const values = keys.map((_, i) => `$${i + 1}`).join(', ');
    return this.infrastructure.pg.query(`INSERT INTO ${name} (${fields}) VALUES (${values}) RETURNING *`, keys.map((key) => body[key])).then((result) => result.rows[0]);
  }
  update(table: string, id: string, body: Record<string, unknown>) {
    const name = tableName(table); const keys = safeKeys(body);
    const set = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    return this.infrastructure.pg.query(`UPDATE ${name} SET ${set} WHERE id = $${keys.length + 1} RETURNING *`, [...keys.map((key) => body[key]), id]).then((result) => result.rows[0]);
  }
  remove(table: string, id: string) {
    const name = tableName(table);
    return this.infrastructure.pg.query(`DELETE FROM ${name} WHERE id = $1 RETURNING id`, [id]).then((result) => ({ deleted: result.rowCount === 1, id }));
  }
}

@Controller('data')
@UseGuards(AuthGuard)
export class DataController {
  constructor(private readonly data: DataService) {}
  @Get(':table') list(@Param('table') table: string, @Query('branch_id') branch?: string) { return this.data.list(table, branch); }
  @Post(':table') create(@Param('table') table: string, @Body() body: Record<string, unknown>) { return this.data.create(table, body); }
  @Patch(':table/:id') update(@Param('table') table: string, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.data.update(table, id, body); }
  @Delete(':table/:id') remove(@Param('table') table: string, @Param('id') id: string) { return this.data.remove(table, id); }
}
