import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { Post } from '@entities/post.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { GameVersion } from '@entities/game-version.entity';
import { PortalService } from './portal.service';
import { PortalV1Controller } from './v1/portal-v1.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, Post, KnowledgeArticle, GameVersion])],
  controllers: [PortalV1Controller],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
