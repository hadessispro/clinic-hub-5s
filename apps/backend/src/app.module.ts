import { Controller, Get, Module } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { AuthController, AuthGuard, AuthService } from './auth';
import { DataController, DataService } from './data';
import { AttendanceController } from './attendance';
import { RpcController, RpcService } from './rpc';
import { FilesController } from './files';

@Controller()
class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/healthz')
  health() {
    return this.infrastructure.status();
  }
}

@Module({
  controllers: [HealthController, AuthController, DataController, AttendanceController, RpcController, FilesController],
  providers: [InfrastructureService, AuthService, AuthGuard, DataService, RpcService],
})
export class AppModule {}
