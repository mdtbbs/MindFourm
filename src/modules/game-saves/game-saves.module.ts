import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BansModule } from '../bans/bans.module';
import { SettingsModule } from '../settings/settings.module';
import { SiteConfigModule } from '../../config/site-config.module';
import { GameSavesController } from './game-saves.controller';
import { GameSavesMaintenanceService } from './game-saves-maintenance.service';
import { GameSavesService } from './game-saves.service';
import { CloudSaveStorageService } from './cloud-save-storage.service';
import { OAuthScopeGuard } from '@common/guards/oauth-scope.guard';
import { CloudSaveNoStoreInterceptor } from './cloud-save-no-store.interceptor';

@Module({
  imports: [AuthModule, BansModule, SettingsModule, SiteConfigModule],
  controllers: [GameSavesController],
  providers: [GameSavesService, CloudSaveStorageService, GameSavesMaintenanceService, OAuthScopeGuard, CloudSaveNoStoreInterceptor],
  exports: [GameSavesService],
})
export class GameSavesModule {}
