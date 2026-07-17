import { Controller, Get } from '@nestjs/common';
import { AppService, type HealthStatus } from './app.service';
import { Public } from './modules/auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
