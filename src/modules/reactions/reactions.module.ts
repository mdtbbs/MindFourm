import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reaction } from '@entities/reaction.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { ReactionsService } from './reactions.service';
import { ReactionsController } from './reactions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Reaction, Post, Reply])],
  controllers: [ReactionsController],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
