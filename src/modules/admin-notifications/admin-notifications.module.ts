import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminNotification, User } from '@entities/index';
import { SettingsModule } from '../settings/settings.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminNotificationStreamService } from './admin-notification-stream.service';
import { AdminNotificationWebhookService } from './admin-notification-webhook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminNotification, User]),
    SettingsModule,
  ],
  providers: [
    AdminNotificationsService,
    AdminNotificationStreamService,
    AdminNotificationWebhookService,
  ],
  controllers: [AdminNotificationsController],
  exports: [AdminNotificationsService],
})
export class AdminNotificationsModule {}
