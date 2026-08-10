import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '@entities/post.entity';
import { ThreadReadAdapterService } from './thread-read-adapter.service';
import { ThreadsV1Controller } from './v1/threads-v1.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Post])],
  controllers: [ThreadsV1Controller],
  providers: [ThreadReadAdapterService],
  exports: [ThreadReadAdapterService],
})
export class ThreadsModule {}
