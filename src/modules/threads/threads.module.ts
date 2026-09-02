import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '@entities/post.entity';
import { ThreadReadAdapterService } from './thread-read-adapter.service';
import { ThreadsV1Controller } from './v1/threads-v1.controller';
import { PostsModule } from '../posts/posts.module';
import { LikesModule } from '../likes/likes.module';
import { BookmarksModule } from '../bookmarks/bookmarks.module';
import { ThreadInteractionsV1Controller } from './v1/thread-interactions-v1.controller';
import { ThreadWriteV1Controller } from './v1/thread-write-v1.controller';
import { RepliesModule } from '../replies/replies.module';

@Module({
  imports: [TypeOrmModule.forFeature([Post]), PostsModule, RepliesModule, LikesModule, BookmarksModule],
  controllers: [ThreadsV1Controller, ThreadInteractionsV1Controller, ThreadWriteV1Controller],
  providers: [ThreadReadAdapterService],
  exports: [ThreadReadAdapterService],
})
export class ThreadsModule {}
