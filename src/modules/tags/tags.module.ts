import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { TagsV1Controller } from './v1-tags.controller';
import { Tag } from '../../entities/tag.entity';
import { Post } from '../../entities/post.entity';
import { PostTag } from '../../entities/post-tag.entity';
import { Reply } from '../../entities/reply.entity';
import { PostSummaryService } from '../posts/post-summary.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, Post, PostTag, Reply])],
  controllers: [TagsController, TagsV1Controller],
  providers: [TagsService, PostSummaryService],
  exports: [TagsService],
})
export class TagsModule {}
