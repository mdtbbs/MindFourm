import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '@entities/category.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { Tag } from '@entities/tag.entity';
import { Setting } from '@entities/setting.entity';
import { RevalidationService } from '@common/services/revalidation.service';
import { NavigationController } from './navigation.controller';
import { NAVIGATION_INVALIDATOR } from './navigation.contract';
import { NavigationService } from './navigation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Category, ResourceCategory, Tag, Setting])],
  controllers: [NavigationController],
  providers: [
    NavigationService,
    RevalidationService,
    { provide: NAVIGATION_INVALIDATOR, useExisting: NavigationService },
  ],
  exports: [NavigationService],
})
export class NavigationModule {}
