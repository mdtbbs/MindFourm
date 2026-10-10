import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { Notice } from '@entities/notice.entity';
import { PortalService } from './portal.service';
import { PortalV1Controller } from './v1/portal-v1.controller';
import { HomeV1Controller } from './v1/home-v1.controller';
import { PostsModule } from '../posts/posts.module';
import { PortalSectionRegistry } from './portal-section.registry';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Category, ResourceCategory, KnowledgeArticle, Notice]), PostsModule],
  controllers: [PortalV1Controller, HomeV1Controller],
  providers: [PortalService, PortalSectionRegistry],
  exports: [PortalService, PortalSectionRegistry],
})
export class PortalModule {}
