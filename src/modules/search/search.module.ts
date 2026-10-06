import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchV1Controller } from './v1-search.controller';
import { SEARCH_SETTINGS_READER, SearchService } from './search.service';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';
import { GroupMember } from '@entities/group-member.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { PostSummaryService } from '../posts/post-summary.service';
import { SettingsModule } from '../settings/settings.module';
import { SearchAudit } from '@entities/search-audit.entity';
import { SearchAuditController } from './search-audit.controller';
import { SettingsService } from '../settings/settings.service';
import { SearchProviderRegistry } from './search-provider.registry';
import { ContentRelation } from '@entities/content-relation.entity';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { SearchIndexMaintenanceController } from './search-index-maintenance.controller';
import { SearchIndexMaintenanceService } from './search-index-maintenance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Post, User, SearchHistory, PopularSearch,
      PostTag, Reply, GroupMember, KnowledgeArticle, SearchAudit, ContentRelation,
    ]),
    SettingsModule,
  ],
  controllers: [SearchController, SearchV1Controller, SearchAuditController, SearchIndexMaintenanceController],
  providers: [
    OAuthScopeGuard,
    SearchService,
    SearchProviderRegistry,
    SearchIndexMaintenanceService,
    PostSummaryService,
    { provide: SEARCH_SETTINGS_READER, useExisting: SettingsService },
  ],
  exports: [SearchService, SearchProviderRegistry],
})
export class SearchModule {}
