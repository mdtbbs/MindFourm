import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { GameSavesModule } from '../game-saves/game-saves.module';
import { SettingsModule } from '../settings/settings.module';
import { SquadsController } from './squads.controller';
import { SquadsService } from './squads.service';
import { SquadLeaseService } from './squad-lease.service';
import { SquadSaveStorageService } from './squad-save-storage.service';
import { SquadSavesMaintenanceService } from './squad-saves-maintenance.service';
import { CloudSaveNoStoreInterceptor } from '../game-saves/cloud-save-no-store.interceptor';
import { OAuthScopeGuard } from '@common/guards/oauth-scope.guard';

@Module({
  imports: [AuthModule, SettingsModule, FriendsModule, GameSavesModule],
  controllers: [SquadsController],
  providers: [
    SquadsService,
    SquadLeaseService,
    SquadSaveStorageService,
    SquadSavesMaintenanceService,
    OAuthScopeGuard,
    CloudSaveNoStoreInterceptor,
  ],
  exports: [SquadsService, SquadLeaseService, SquadSaveStorageService],
})
export class SquadSavesModule {}
