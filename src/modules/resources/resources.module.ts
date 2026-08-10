import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesService } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { MflClientService } from './mfl-client.service';
import { ResourcesController } from './resources.controller';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceRating } from '@entities/resource-rating.entity';
import { User } from '@entities/user.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RevalidationService } from '@common/services/revalidation.service';
import { ResourceAggregateService } from './resource-aggregate.service';
import { ResourceLegacyProjectionService } from './resource-legacy-projection.service';
import { ResourceReadAdapterService } from './resource-read-adapter.service';
import { ResourcesV1Controller } from './v1/resources-v1.controller';
import { CapabilitiesModule } from '../capabilities/capabilities.module';

@Module({
  imports: [
    AdminNotificationsModule,
    NotificationsModule,
    CapabilitiesModule,
    TypeOrmModule.forFeature([Resource, ResourceCategory, ResourceVersion, ResourceRating, User, ResourceAttribution, ResourceFile]),
  ],
  providers: [ResourcesService, ResourceCategoryService, ResourceVersionService, MflClientService, RevalidationService, ResourceAggregateService, ResourceLegacyProjectionService, ResourceReadAdapterService],
  controllers: [ResourcesController, ResourcesV1Controller],
  exports: [ResourcesService, ResourceCategoryService, ResourceVersionService, MflClientService, ResourceAggregateService, ResourceLegacyProjectionService, ResourceReadAdapterService],
})
export class ResourcesModule {}
