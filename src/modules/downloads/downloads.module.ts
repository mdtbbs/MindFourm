import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { DownloadPolicyService } from './download-policy.service';
import { DownloadGrantService } from './download-grant.service';
import { DownloadEventsService } from './download-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, ResourceVersion, ResourceFile])],
  providers: [DownloadPolicyService, DownloadGrantService, DownloadEventsService],
  exports: [DownloadPolicyService, DownloadGrantService, DownloadEventsService],
})
export class DownloadsModule {}
