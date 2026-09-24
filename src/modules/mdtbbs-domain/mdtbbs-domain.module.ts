import { Module } from '@nestjs/common';
import { ResourcesModule } from '../resources/resources.module';
import { ServersModule } from '../servers/servers.module';
import { PostServersModule } from '../post-servers/post-servers.module';
import { AutoPostModule } from '../auto-post/auto-post.module';
import { LanLinkModule } from '../lanlink/lanlink.module';
import { GameVersionsModule } from '../game-versions/game-versions.module';
import { GameServersModule } from '../game-servers/game-servers.module';
import { DiscoverModule } from '../discover/discover.module';
import { DeveloperFeedModule } from '../developer-feed/developer-feed.module';
import { PortalModule } from '../portal/portal.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@entities/resource.entity';
import { GameServer } from '@entities/game-server.entity';
import { GameVersion } from '@entities/game-version.entity';
import { DeveloperFeedEntry } from '@entities/developer-feed-entry.entity';
import { Post } from '@entities/post.entity';
import { SearchModule } from '../search/search.module';
import {
  MdtbbsResourceSearchProvider,
  MdtbbsGameServerSearchProvider,
  MdtbbsGameVersionSearchProvider,
  MdtbbsDeveloperFeedSearchProvider,
} from './mdtbbs-search.providers';
import { MdtbbsPortalSectionProvider } from './mdtbbs-portal.provider';
import { GameContentModule } from '../game-content/game-content.module';

/** Composition root for the Mindustry/MDTBBS-specific application capabilities. */
@Module({
  imports: [
    SearchModule,
    TypeOrmModule.forFeature([Resource, GameServer, GameVersion, DeveloperFeedEntry, Post]),
    ResourcesModule, GameContentModule, ServersModule, PostServersModule, AutoPostModule, LanLinkModule,
    GameVersionsModule, GameServersModule, DiscoverModule, PortalModule, DeveloperFeedModule,
  ],
  providers: [MdtbbsResourceSearchProvider, MdtbbsGameServerSearchProvider,
    MdtbbsGameVersionSearchProvider, MdtbbsDeveloperFeedSearchProvider, MdtbbsPortalSectionProvider],
})
export class MdtbbsDomainModule {}
