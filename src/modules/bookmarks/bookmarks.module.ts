import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookmarksService } from './bookmarks.service';
import { BookmarksController } from './bookmarks.controller';
import { Bookmark } from '../../entities/bookmark.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Bookmark, Post, User, Category])],
  providers: [BookmarksService],
  exports: [BookmarksService],
  controllers: [BookmarksController],
})
export class BookmarksModule {}
