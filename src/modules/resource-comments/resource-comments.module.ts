import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { Reply } from '@entities/reply.entity';
import { LikesModule } from '../likes/likes.module';
import { RepliesModule } from '../replies/replies.module';
import { ResourceCommentsService } from './resource-comments.service';
import { ResourceCommentsController } from './resource-comments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, Reply]), RepliesModule, LikesModule],
  controllers: [ResourceCommentsController],
  providers: [ResourceCommentsService],
  exports: [ResourceCommentsService],
})
export class ResourceCommentsModule {}
