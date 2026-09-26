import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceLike } from '@entities/resource-like.entity';
import { ResourceFavorite } from '@entities/resource-favorite.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { DownloadEvent } from '@entities/download-event.entity';
import { GameContentUploadSession } from '@entities/game-content-upload-session.entity';
import { ResourcesModule } from '../resources/resources.module';
import { DownloadsModule } from '../downloads/downloads.module';
import { GameContentController } from './game-content.controller';
import { GameContentService } from './game-content.service';
import { GameContentAuthGuard, GameContentRequiredAuthGuard } from './game-content-auth.guard';
import { GameContentCacheInterceptor } from './game-content-cache.interceptor';
import { GameContentUploadSessionService } from './game-content-upload-session.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ResourcesModule, DownloadsModule, SettingsModule, TypeOrmModule.forFeature([Resource, ResourceLike, ResourceFavorite, ResourceVersion, ResourceFile, DownloadEvent, GameContentUploadSession])],
  controllers: [GameContentController],
  providers: [GameContentService, GameContentAuthGuard, GameContentRequiredAuthGuard, GameContentCacheInterceptor, GameContentUploadSessionService],
})
export class GameContentModule {}
