import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceComment } from '@entities/resource-comment.entity';
import { ResourceCommentsService } from './resource-comments.service';
import { ResourceCommentsController } from './resource-comments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceComment])],
  controllers: [ResourceCommentsController],
  providers: [ResourceCommentsService],
  exports: [ResourceCommentsService],
})
export class ResourceCommentsModule {}
