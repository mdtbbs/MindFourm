import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CspReportsService } from './csp-reports.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly reports: CspReportsService) {}

  @Post('csp-reports')
  @Public()
  @HttpCode(204)
  async cspReport(@Body() body: unknown): Promise<void> {
    // Store directive aggregates only. Raw document URLs can contain identifiers
    // or query values and do not belong in operational telemetry.
    await this.reports.record(body).catch(() => undefined);
  }
}
