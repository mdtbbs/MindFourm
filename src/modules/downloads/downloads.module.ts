import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { DownloadEvent } from '@entities/download-event.entity';
import { DownloadPolicyService } from './download-policy.service';
import { DownloadGrantService } from './download-grant.service';
import { DownloadEventsService } from './download-events.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, ResourceVersion, ResourceFile, DownloadEvent]), SettingsModule],
  providers: [DownloadPolicyService, DownloadGrantService, DownloadEventsService],
  exports: [DownloadPolicyService, DownloadGrantService, DownloadEventsService],
})
export class DownloadsModule {}
