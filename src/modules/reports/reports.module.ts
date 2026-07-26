import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from '@entities/report.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { Resource } from '@entities/resource.entity';
import { User } from '@entities/user.entity';
import { SettingsModule } from '../settings/settings.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsAdminController } from './reports-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Post, Reply, Resource, User]),
    SettingsModule,
    AdminNotificationsModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController, ReportsAdminController],
  exports: [ReportsService],
})
export class ReportsModule {}
