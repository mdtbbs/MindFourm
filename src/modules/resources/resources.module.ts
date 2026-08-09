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
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RevalidationService } from '@common/services/revalidation.service';

@Module({
  imports: [
    AdminNotificationsModule,
    NotificationsModule,
    TypeOrmModule.forFeature([Resource, ResourceCategory, ResourceVersion, ResourceRating, User]),
  ],
  providers: [ResourcesService, ResourceCategoryService, ResourceVersionService, MflClientService, RevalidationService],
  controllers: [ResourcesController],
  exports: [ResourcesService, ResourceCategoryService, ResourceVersionService, MflClientService],
})
export class ResourcesModule {}
