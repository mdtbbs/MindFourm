import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesService } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { MflClientService } from './mfl-client.service';
import { ResourcesController } from './resources.controller';
import { Resource } from '@entities/resource.entity';
import { ResourceMember } from '@entities/resource-center-v2.entity';
import { ResourceUploadDraft } from '@entities/resource-upload-draft.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceRating } from '@entities/resource-rating.entity';
import { User } from '@entities/user.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceDirectUploadSession } from '@entities/resource-direct-upload-session.entity';
import { ResourceDirectUploadDraft } from '@entities/resource-direct-upload-draft.entity';
import { ResourceFavorite } from '@entities/resource-favorite.entity';
import { ResourceLike } from '@entities/resource-like.entity';
import { ResourceSubscription } from '@entities/resource-subscription.entity';
import { ModReportAttachment } from '@entities/mod-report-attachment.entity';
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
import { ResourceStorageClientService } from './resource-storage-client.service';
import { ResourceFileProviderService } from './resource-file-provider.service';
import { ResourceDirectUploadService } from './resource-direct-upload.service';
import { LogsModule } from '../logs/logs.module';
import { ResourceLifecycleService } from './resource-lifecycle.service';
import { ResourceSubscriptionsService } from './resource-subscriptions.service';
import { NavigationModule } from '../navigation/navigation.module';
import { ResourcePreviewService } from './resource-preview.service';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { ResourcesV1WriteController } from './v1/resources-v1-write.controller';
import { ResourcesV2Controller, GameContentIndexV2Controller } from './v2/resources-v2.controller';
import { ResourcesV2Service } from './v2/resources-v2.service';
import { ResourcesV2WriteController } from './v2/resources-v2-write.controller';
import { ResourcesV2WriteService } from './v2/resources-v2-write.service';
import { ResourceV2CommunityWriteService } from './v2/resource-v2-community-write.service';
import { ResourcesV2CommunityWriteController } from './v2/resources-v2-community-write.controller';
import { ResourceV2ReviewService } from './v2/resource-v2-review.service';
import { ResourcesV2ReviewController } from './v2/resources-v2-review.controller';
import { ResourceSourceSyncService } from './v2/resource-source-sync.service';
import { ResourcesV2SourceSyncController } from './v2/resources-v2-source-sync.controller';
import { ResourcesV2ReportAttachmentController } from './v2/resources-v2-report-attachment.controller';
import { ResourceV2ReportAttachmentService } from './v2/resource-v2-report-attachment.service';
import { ResourceDuplicateService } from './resource-duplicate.service';
import { CustomEmojisModule } from '../custom-emojis/custom-emojis.module';
import { ResourceViewsService } from './resource-views.service';
import { DownloadsModule } from '../downloads/downloads.module';
import { ResourceCommentsModule } from '../resource-comments/resource-comments.module';
import { ResourceStorageReconciliationService } from './resource-storage-reconciliation.service';
import { ResourceStorageReconciliationController } from './resource-storage-reconciliation.controller';

@Module({
  imports: [
    AdminNotificationsModule,
    NotificationsModule,
    CapabilitiesModule,
    SettingsModule,
    LogsModule,
    NavigationModule,
    CustomEmojisModule,
    DownloadsModule,
    ResourceCommentsModule,
    TypeOrmModule.forFeature([Resource, ResourceMember, ResourceUploadDraft, ResourceDirectUploadSession, ResourceDirectUploadDraft, ResourceCategory, ResourceVersion, ResourceRating, User, ResourceAttribution, ResourceFile, ResourceFavorite, ResourceLike, ResourceSubscription, ModReportAttachment]),
  ],
  providers: [OAuthScopeGuard, ResourceDuplicateService, ResourceViewsService, ResourcesService, ResourceCategoryService, ResourceVersionService, ResourceFavoritesService, ResourceLikesService, ResourceSubscriptionsService, MflClientService, ResourceStorageService, ResourceStorageClientService, ResourceFileProviderService, ResourceDirectUploadService, ResourcePreviewService, ResourceLifecycleService, ResourceStorageReconciliationService, RevalidationService, ResourceAggregateService, ResourceLegacyProjectionService, ResourceReadAdapterService, ResourcesV2Service, ResourcesV2WriteService, ResourceV2CommunityWriteService, ResourceV2ReportAttachmentService, ResourceV2ReviewService, ResourceSourceSyncService],
  controllers: [ResourcesController, ResourcesV1Controller, ResourcesV1WriteController, ResourcesV2Controller, GameContentIndexV2Controller, ResourcesV2WriteController, ResourcesV2CommunityWriteController, ResourcesV2ReviewController, ResourcesV2SourceSyncController, ResourcesV2ReportAttachmentController, ResourceStorageReconciliationController],
  exports: [ResourcesService, ResourceCategoryService, ResourceVersionService, ResourceFavoritesService, ResourceLikesService, ResourceStorageService, ResourceStorageClientService, ResourceFileProviderService, ResourcePreviewService, ResourceDuplicateService, MflClientService, ResourceAggregateService, ResourceLegacyProjectionService, ResourceReadAdapterService],
})
export class ResourcesModule {}
