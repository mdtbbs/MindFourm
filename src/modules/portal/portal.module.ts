import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { Post } from '@entities/post.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { GameVersion } from '@entities/game-version.entity';
import { Notice } from '@entities/notice.entity';
import { PortalService } from './portal.service';
import { PortalV1Controller } from './v1/portal-v1.controller';
import { HomeV1Controller } from './v1/home-v1.controller';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, Post, KnowledgeArticle, GameVersion, Notice]), PostsModule],
  controllers: [PortalV1Controller, HomeV1Controller],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
