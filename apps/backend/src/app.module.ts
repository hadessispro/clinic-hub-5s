import { Controller, Get, Module } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { AuthController, AuthGuard, AuthService } from './auth';

@Controller()
class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/healthz')
  health() {
    return this.infrastructure.status();
  }
}

@Module({
  controllers: [HealthController, AuthController],
  providers: [InfrastructureService, AuthService, AuthGuard],
})
export class AppModule {}
