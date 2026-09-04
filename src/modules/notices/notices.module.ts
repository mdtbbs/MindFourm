import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notice } from '@entities/notice.entity';
import { NoticeRevision } from '@entities/notice-revision.entity';
import { NoticesService } from './notices.service';
import { AdminNoticesController, NoticesController } from './notices.controller';
import { LogsModule } from '../logs/logs.module';

@Module({ imports: [TypeOrmModule.forFeature([Notice, NoticeRevision]), LogsModule], controllers: [NoticesController, AdminNoticesController], providers: [NoticesService], exports: [NoticesService] })
export class NoticesModule {}
