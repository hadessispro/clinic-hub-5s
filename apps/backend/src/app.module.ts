import { Controller, Get, Module } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { AuthController, AuthGuard, AuthService } from './auth';
import { DataController, DataService } from './data';
import { AttendanceController, AttendanceWorkController } from './attendance';
import { RpcController, RpcService } from './rpc';
import { FilesController } from './files';
import { PushController } from './push';
import { MarketingController, MarketingService } from './marketing';
import { PgRegistrationController, PgRegistrationService } from './pg-registration';
import { GiftsController, GiftsService } from './gifts';
import { ScheduleController, ScheduleService } from './schedule';

@Controller()
class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/healthz')
  health() {
    return this.infrastructure.status();
  }
}

@Module({
  controllers: [HealthController, AuthController, PgRegistrationController, DataController, AttendanceController, AttendanceWorkController, RpcController, FilesController, PushController, MarketingController, GiftsController, ScheduleController],
  providers: [InfrastructureService, AuthService, PgRegistrationService, AuthGuard, DataService, RpcService, MarketingService, GiftsService, ScheduleService],
})
export class AppModule {}
