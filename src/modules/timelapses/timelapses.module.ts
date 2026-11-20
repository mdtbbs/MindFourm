import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { LogsModule } from '../logs/logs.module';
import { PointsModule } from '../points/points.module';
import { PostsModule } from '../posts/posts.module';
import { BansModule } from '../bans/bans.module';
import { TimelapseReport } from '../../entities/timelapse-report.entity';
import { TimelapsePostRef } from '../../entities/timelapse-post-ref.entity';
import { User } from '../../entities/user.entity';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { TimelapseRefsModule } from './timelapse-refs.module';
import { TimelapsesService } from './timelapses.service';
import { TimelapseStorageService } from './timelapse-storage.service';
import { TimelapseQueueService } from './timelapse-queue.service';
import { TimelapseMaintenanceService } from './timelapse-maintenance.service';
import { TimelapsesController } from './timelapses.controller';
import { TimelapsesAdminController } from './timelapses-admin.controller';
import { TimelapsesInternalController } from './timelapses-internal.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimelapseReport, TimelapsePostRef, User]),
    AuthModule,
    SettingsModule,
    NotificationsModule,
    AdminNotificationsModule,
    LogsModule,
    PointsModule,
    BansModule,
    TimelapseRefsModule,
    PostsModule,
  ],
  controllers: [TimelapsesController, TimelapsesAdminController, TimelapsesInternalController],
  providers: [
    TimelapsesService,
    TimelapseStorageService,
    TimelapseQueueService,
    TimelapseMaintenanceService,
    OAuthScopeGuard,
  ],
  exports: [TimelapsesService, TimelapseStorageService, TimelapseRefsModule],
})
export class TimelapsesModule {}
