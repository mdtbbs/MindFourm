import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { Attachment } from '@entities/attachment.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { ForgePreviewService } from './forge-preview.service';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Post, Reply])],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, ForgePreviewService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
