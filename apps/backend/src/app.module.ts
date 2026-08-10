import { Controller, Get, Module } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { AuthController, AuthGuard, AuthService } from './auth';
import { DataController, DataService } from './data';
import { AttendanceController } from './attendance';

@Controller()
class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/healthz')
  health() {
    return this.infrastructure.status();
  }
}

@Module({
  controllers: [HealthController, AuthController, DataController, AttendanceController],
  providers: [InfrastructureService, AuthService, AuthGuard, DataService],
})
export class AppModule {}
