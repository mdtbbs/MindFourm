import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { Attachment } from '@entities/attachment.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { ForgePreviewService } from './forge-preview.service';
import { AttachmentLifecycleService } from './attachment-lifecycle.service';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Post, Reply]), SettingsModule, LogsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, ForgePreviewService, AttachmentLifecycleService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
