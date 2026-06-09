import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { StatsModule } from '../stats/stats.module';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';
import { BansModule } from '../bans/bans.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { Post, User, Category, Tag, PostTag, Ban, Setting, OperationLog, Reply } from '@entities/index';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, User, Category, Tag, PostTag, Ban, Setting, OperationLog, Reply]),
    StatsModule,
    SettingsModule,
    LogsModule,
    BansModule,
    CategoriesModule,
    TagsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
