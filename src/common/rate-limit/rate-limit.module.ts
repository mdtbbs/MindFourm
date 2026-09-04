import { Global, Module } from '@nestjs/common';
import { RateLimitTelemetryService } from './rate-limit-telemetry.service';

@Global()
@Module({ providers: [RateLimitTelemetryService], exports: [RateLimitTelemetryService] })
export class RateLimitModule {}
