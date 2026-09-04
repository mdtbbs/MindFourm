import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { Post } from '@entities/post.entity';
import { GameServer } from '@entities/game-server.entity';
import { DiscoverService } from './discover.service';
import { DiscoverV1Controller } from './v1/discover-v1.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, Post, GameServer])],
  controllers: [DiscoverV1Controller],
  providers: [DiscoverService],
  exports: [DiscoverService],
})
export class DiscoverModule {}
