import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { Tag } from '../../entities/tag.entity';
import { Post } from '../../entities/post.entity';
import { PostTag } from '../../entities/post-tag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, Post, PostTag])],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
