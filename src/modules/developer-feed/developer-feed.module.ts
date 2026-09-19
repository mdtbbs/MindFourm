import { Module } from '@nestjs/common'; import { TypeOrmModule } from '@nestjs/typeorm';
import { DeveloperFeedEntry } from '@entities/developer-feed-entry.entity'; import { ServiceAccount } from '@entities/service-account.entity'; import { DeveloperFeedService } from './developer-feed.service'; import { DeveloperFeedController } from './developer-feed.controller';
@Module({ imports: [TypeOrmModule.forFeature([DeveloperFeedEntry, ServiceAccount])], providers: [DeveloperFeedService], controllers: [DeveloperFeedController], exports: [DeveloperFeedService] }) export class DeveloperFeedModule {}
