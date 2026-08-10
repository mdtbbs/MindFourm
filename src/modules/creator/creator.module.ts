import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@entities/user.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { Post } from '@entities/post.entity';
import { ResourceFavorite } from '@entities/resource-favorite.entity';
import { CreatorAggregationService } from './creator-aggregation.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ResourceAttribution, Post, ResourceFavorite])],
  providers: [CreatorAggregationService],
  exports: [CreatorAggregationService],
})
export class CreatorModule {}
