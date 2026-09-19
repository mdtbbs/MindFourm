import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeveloperFeedEntry } from '@entities/developer-feed-entry.entity';
import { ServiceAccount } from '@entities/service-account.entity';

export type GithubFeedInput = { repository: string; itemType: 'issue' | 'pull_request'; externalId: string; state: 'open' | 'closed' | 'merged'; title: string; url: string; author: { login: string; name?: string; avatarUrl?: string }; openedAt?: Date; closedAt?: Date; mergedAt?: Date; lowValue?: boolean };

@Injectable()
export class DeveloperFeedService {
  constructor(@InjectRepository(DeveloperFeedEntry) private readonly entries: Repository<DeveloperFeedEntry>, @InjectRepository(ServiceAccount) private readonly accounts: Repository<ServiceAccount>) {}

  async ensureServiceAccounts(): Promise<ServiceAccount[]> {
    const specs = [{ slug: 'github-sync', display_name: 'GitHub 同步', kind: 'sync' }, { slug: 'ai-summary', display_name: 'AI 摘要', kind: 'ai' }];
    return Promise.all(specs.map(async spec => this.accounts.save(Object.assign(await this.accounts.findOne({ where: { slug: spec.slug } }) || this.accounts.create(), spec))));
  }

  async upsertGithub(input: GithubFeedInput): Promise<DeveloperFeedEntry> {
    const existing = await this.entries.findOne({ where: { provider: 'github', repository: input.repository, item_type: input.itemType, external_id: input.externalId } });
    return this.entries.save(Object.assign(existing || this.entries.create(), {
      provider: 'github', repository: input.repository, item_type: input.itemType, external_id: input.externalId,
      state: input.state, author_login: input.author.login, author_display_name: input.author.name || null,
      author_avatar_url: input.author.avatarUrl || null, source_url: input.url, summary: input.title,
      is_low_value: !!input.lowValue, is_indexable: !input.lowValue, opened_at: input.openedAt || null,
      closed_at: input.closedAt || null, merged_at: input.mergedAt || null,
    }));
  }

  list(limit = 30) { return this.entries.find({ order: { updated_at: 'DESC' }, take: Math.max(1, Math.min(limit, 100)) }); }
}
