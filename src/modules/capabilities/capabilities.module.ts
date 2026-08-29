import { Module } from '@nestjs/common';
import { CapabilitiesController } from './capabilities.controller';
import { ClientConfigV1Controller } from './client-config-v1.controller';
import { CapabilitiesService } from './capabilities.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [CapabilitiesController, ClientConfigV1Controller],
  providers: [CapabilitiesService],
  exports: [CapabilitiesService],
})
export class CapabilitiesModule {}
