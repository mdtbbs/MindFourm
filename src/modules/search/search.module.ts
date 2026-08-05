import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';
import { Resource } from '@entities/resource.entity';
import { PostSummaryService } from '../posts/post-summary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, User, SearchHistory, PopularSearch, PostTag, Reply, Resource]),
  ],
  controllers: [SearchController],
  providers: [SearchService, PostSummaryService],
  exports: [SearchService],
})
export class SearchModule {}
