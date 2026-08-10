import { Controller, Get, Module } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';

@Controller()
class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/healthz')
  health() {
    return this.infrastructure.status();
  }
}

@Module({
  controllers: [HealthController],
  providers: [InfrastructureService],
})
export class AppModule {}
