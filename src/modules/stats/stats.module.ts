import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsService } from './stats.service';
import { Post, Reply, User } from '@entities/index';
import { RedisModule } from '../../database/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Reply, User]), RedisModule],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
