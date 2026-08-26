import { Controller, Get, Module } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { AuthController, AuthGuard, AuthService } from './auth';
import { DataController, DataService } from './data';
import { AttendanceController } from './attendance';
import { RpcController, RpcService } from './rpc';
import { FilesController } from './files';
import { PushController } from './push';
import { MarketingController, MarketingService } from './marketing';
import { PgRegistrationController, PgRegistrationService } from './pg-registration';
import { GiftsController, GiftsService } from './gifts';

@Controller()
class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/healthz')
  health() {
    return this.infrastructure.status();
  }
}

@Module({
  controllers: [HealthController, AuthController, PgRegistrationController, DataController, AttendanceController, RpcController, FilesController, PushController, MarketingController, GiftsController],
  providers: [InfrastructureService, AuthService, PgRegistrationService, AuthGuard, DataService, RpcService, MarketingService, GiftsService],
})
export class AppModule {}
