import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, User, SearchHistory, PopularSearch]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
