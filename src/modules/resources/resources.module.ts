import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesService } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { ResourcesController } from './resources.controller';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { User } from '@entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceCategory, ResourceVersion, User]),
  ],
  providers: [ResourcesService, ResourceCategoryService, ResourceVersionService],
  controllers: [ResourcesController],
  exports: [ResourcesService, ResourceCategoryService, ResourceVersionService],
})
export class ResourcesModule {}
