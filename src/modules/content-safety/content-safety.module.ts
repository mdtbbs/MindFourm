import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';
import { ContentSafetyService } from './content-safety.service';

@Global()
@Module({
  imports: [SettingsModule, LogsModule],
  providers: [ContentSafetyService],
  exports: [ContentSafetyService],
})
export class ContentSafetyModule {}
