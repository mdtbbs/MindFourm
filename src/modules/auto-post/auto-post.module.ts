import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { Notification } from '@entities/notification.entity';
import { AutoPostService } from './auto-post.service';
import { AutoPostController } from './auto-post.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Category, Notification])],
  controllers: [AutoPostController],
  providers: [AutoPostService],
  exports: [AutoPostService],
})
export class AutoPostModule {}
