import { Controller, Get, Injectable, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { AuthController, AuthGuard, AuthService } from './auth';
import { DataController, DataService } from './data';
import { AttendanceAdjustmentController, AttendanceController, AttendanceWorkController } from './attendance';
import { RpcController, RpcService } from './rpc';
import { FilesController } from './files';
import { PushController } from './push';
import { MarketingController, MarketingService } from './marketing';
import { PgRegistrationController, PgRegistrationService } from './pg-registration';
import { GiftsController, GiftsService } from './gifts';
import { ScheduleController, ScheduleService } from './schedule';
import { TelegramController, TelegramService } from './telegram';
import { SecurityController, SecurityService } from './security';

@Controller()
class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get('/healthz')
  health() {
    return this.infrastructure.status();
  }
}

@Injectable()
export class DailyReportScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private lastReportDate = '';

  constructor(private readonly telegram: TelegramService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const vnParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const map = Object.fromEntries(vnParts.map((p) => [p.type, p.value]));
    const dateKey = `${map.year}-${map.month}-${map.day}`;

    // Tự động gửi báo cáo vận hành toàn diện vào 22:00 hằng ngày
    if (map.hour === '22' && Number(map.minute) <= 4 && this.lastReportDate !== dateKey) {
      this.lastReportDate = dateKey;
      try {
        const report = await this.telegram.buildDailyReport();
        await this.telegram.broadcast(report, 'HTML');
      } catch (err) {
        console.error('[DailyReportScheduler] Error sending daily report:', err);
      }
    }
  }
}

@Module({
  controllers: [
    HealthController,
    AuthController,
    PgRegistrationController,
    DataController,
    AttendanceController,
    AttendanceWorkController,
    AttendanceAdjustmentController,
    RpcController,
    FilesController,
    PushController,
    MarketingController,
    GiftsController,
    ScheduleController,
    TelegramController,
    SecurityController,
  ],
  providers: [
    InfrastructureService,
    AuthService,
    PgRegistrationService,
    AuthGuard,
    DataService,
    RpcService,
    MarketingService,
    GiftsService,
    ScheduleService,
    TelegramService,
    SecurityService,
    DailyReportScheduler,
  ],
})
export class AppModule {}
