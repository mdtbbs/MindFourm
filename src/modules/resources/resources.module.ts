import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesService } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { MflClientService } from './mfl-client.service';
import { ResourcesController } from './resources.controller';
import { Resource } from '@entities/resource.entity';
import { ResourceUploadDraft } from '@entities/resource-upload-draft.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceRating } from '@entities/resource-rating.entity';
import { User } from '@entities/user.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceFavorite } from '@entities/resource-favorite.entity';
import { ResourceLike } from '@entities/resource-like.entity';
import { ResourceSubscription } from '@entities/resource-subscription.entity';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RevalidationService } from '@common/services/revalidation.service';
import { ResourceAggregateService } from './resource-aggregate.service';
import { ResourceLegacyProjectionService } from './resource-legacy-projection.service';
import { ResourceReadAdapterService } from './resource-read-adapter.service';
import { ResourceFavoritesService } from './resource-favorites.service';
import { ResourceLikesService } from './resource-likes.service';
import { ResourcesV1Controller } from './v1/resources-v1.controller';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { SettingsModule } from '../settings/settings.module';
import { ResourceStorageService } from './resource-storage.service';
import { LogsModule } from '../logs/logs.module';
import { ResourceLifecycleService } from './resource-lifecycle.service';
import { ResourceSubscriptionsService } from './resource-subscriptions.service';
import { NavigationModule } from '../navigation/navigation.module';
import { ResourcePreviewService } from './resource-preview.service';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { ResourcesV1WriteController } from './v1/resources-v1-write.controller';
import { ResourceDuplicateService } from './resource-duplicate.service';

@Module({
  imports: [
    AdminNotificationsModule,
    NotificationsModule,
    CapabilitiesModule,
    SettingsModule,
    LogsModule,
    NavigationModule,
    TypeOrmModule.forFeature([Resource, ResourceUploadDraft, ResourceCategory, ResourceVersion, ResourceRating, User, ResourceAttribution, ResourceFile, ResourceFavorite, ResourceLike, ResourceSubscription]),
  ],
  providers: [OAuthScopeGuard, ResourceDuplicateService, ResourcesService, ResourceCategoryService, ResourceVersionService, ResourceFavoritesService, ResourceLikesService, ResourceSubscriptionsService, MflClientService, ResourceStorageService, ResourcePreviewService, ResourceLifecycleService, RevalidationService, ResourceAggregateService, ResourceLegacyProjectionService, ResourceReadAdapterService],
  controllers: [ResourcesController, ResourcesV1Controller, ResourcesV1WriteController],
  exports: [ResourcesService, ResourceCategoryService, ResourceVersionService, ResourceFavoritesService, ResourceLikesService, ResourceStorageService, ResourcePreviewService, ResourceDuplicateService, MflClientService, ResourceAggregateService, ResourceLegacyProjectionService, ResourceReadAdapterService],
})
export class ResourcesModule {}
