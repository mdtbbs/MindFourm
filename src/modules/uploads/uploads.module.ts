import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UploadsV1Controller } from './v1-uploads.controller';
import { SettingsModule } from '../settings/settings.module';
import { PublicImageCleanupService } from './public-image-cleanup.service';

@Module({
  imports: [SettingsModule],
  controllers: [UploadsController, UploadsV1Controller],
  providers: [UploadsService, PublicImageCleanupService],
  exports: [UploadsService, PublicImageCleanupService],
})
export class UploadsModule {}
