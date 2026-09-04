import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsService } from './stats.service';
import { Post, Reply, SessionAudit, User } from '@entities/index';
import { StatsController } from './stats.controller';
import { RedisModule } from '../../database/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Reply, User, SessionAudit]), RedisModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
