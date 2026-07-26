import { Controller, Get } from '@nestjs/common';
import { Public } from '@common/decorators/public.decorator';
import { SkipRateLimit } from '@common/decorators/rate-limit.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  // Load balancers and uptime monitors poll this frequently from one address.
  @SkipRateLimit()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
