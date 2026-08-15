import { Global, Module } from '@nestjs/common';
import { PerformanceTelemetryService } from './performance-telemetry.service';

@Global()
@Module({ providers: [PerformanceTelemetryService], exports: [PerformanceTelemetryService] })
export class PerformanceTelemetryModule {}
