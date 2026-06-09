import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { RssService } from './rss.service';
import { RssController } from './rss.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Category])],
  controllers: [RssController],
  providers: [RssService],
  exports: [RssService],
})
export class RssModule {}
