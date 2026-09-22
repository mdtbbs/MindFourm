import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchV1Controller } from './v1-search.controller';
import { SearchService } from './search.service';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';
import { Resource } from '@entities/resource.entity';
import { GroupMember } from '@entities/group-member.entity';
import { GameServer } from '@entities/game-server.entity';
import { GameVersion } from '@entities/game-version.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { DeveloperFeedEntry } from '@entities/developer-feed-entry.entity';
import { PostSummaryService } from '../posts/post-summary.service';
import { SettingsModule } from '../settings/settings.module';
import { SearchAudit } from '@entities/search-audit.entity';
import { SearchAuditController } from './search-audit.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Post, User, SearchHistory, PopularSearch, PostTag, Reply, Resource,
      GroupMember, GameServer, GameVersion, KnowledgeArticle, DeveloperFeedEntry, SearchAudit,
    ]),
    SettingsModule,
  ],
  controllers: [SearchController, SearchV1Controller, SearchAuditController],
  providers: [SearchService, PostSummaryService],
  exports: [SearchService],
})
export class SearchModule {}
