import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BansModule } from '../bans/bans.module';
import { SettingsModule } from '../settings/settings.module';
import { SiteConfigModule } from '../../config/site-config.module';
import { OAuthScopeGuard } from '@common/guards/oauth-scope.guard';
import { BlobStorageService } from './blob-storage.service';
import { BlobsController } from './blobs.controller';
import { BlobsMaintenanceService } from './blobs-maintenance.service';
import { BlobsService } from './blobs.service';
import { BlobNoStoreInterceptor } from './blob-no-store.interceptor';

@Module({
  imports: [AuthModule, BansModule, SettingsModule, SiteConfigModule],
  controllers: [BlobsController],
  providers: [BlobsService, BlobStorageService, BlobsMaintenanceService, OAuthScopeGuard, BlobNoStoreInterceptor],
  exports: [BlobsService],
})
export class BlobsModule {}
