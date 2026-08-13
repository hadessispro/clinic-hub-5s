import { BadRequestException, Body, Controller, Injectable, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth';
import { InfrastructureService } from './infrastructure';

const RPC_ALLOWLIST = new Set(['resolve_login_email', 'submit_attendance_event', 'approve_leave_request', 'approve_schedule_request']);

@Injectable()
export class RpcService {
  constructor(private readonly infrastructure: InfrastructureService) {}
  async call(name: string, args: Record<string, unknown>) {
    if (!RPC_ALLOWLIST.has(name)) throw new BadRequestException('RPC không được phép.');
    const keys = Object.keys(args).filter((key) => /^[a-z][a-z0-9_]*$/.test(key));
    const placeholders = keys.map((key, i) => `${key} => $${i + 1}`).join(', ');
    const result = await this.infrastructure.pg.query(`SELECT * FROM ${name}(${placeholders})`, keys.map((key) => args[key]));
    return result.rows;
  }
}

@Controller('rpc')
@UseGuards(AuthGuard)
export class RpcController {
  constructor(private readonly rpc: RpcService) {}
  @Post(':name') call(@Param('name') name: string, @Body() args: Record<string, unknown>) { return this.rpc.call(name, args); }
}
