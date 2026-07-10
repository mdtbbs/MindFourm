import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationStreamService } from './notification-stream.service';
import { EmailService } from './email.service';
import { EmailQueueService } from './email-queue.service';
import { TemplateService } from './template.service';
import { Notification } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { EmailLog } from '../../entities/email-log.entity';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, Post, Reply, EmailLog]),
    SettingsModule,
  ],
  providers: [
    NotificationsService,
    NotificationStreamService,
    EmailService,
    EmailQueueService,
    TemplateService,
  ],
  exports: [NotificationsService, EmailService, EmailQueueService, TemplateService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
