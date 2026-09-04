import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LikesService } from './likes.service';
import { LikesController } from './likes.controller';
import { PostLike } from '@entities/post-like.entity';
import { ReplyLike } from '@entities/reply-like.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { User } from '@entities/user.entity';
import { Notification } from '@entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PostLike, ReplyLike, Post, Reply, User, Notification]),
    NotificationsModule,
    PointsModule,
  ],
  controllers: [LikesController],
  providers: [LikesService],
  exports: [LikesService],
})
export class LikesModule {}
