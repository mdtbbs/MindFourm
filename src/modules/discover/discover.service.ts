import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { Post } from '@entities/post.entity';
import { GameServer } from '@entities/game-server.entity';

/**
 * Discover Service — aggregates content from multiple domains for discovery.
 *
 * Uses only stable, public DTOs. No speculative recommendation engine.
 * Content visibility is always enforced at the domain level, not bypassed here.
 */

export type DiscoverSummary = {
  total_resources: number;
  total_threads: number;
  total_servers: number;
  recent_resources: { id: number; title: string; created_at: string }[];
  recent_threads: { id: number; title: string; created_at: string }[];
  active_servers: { id: number; name: string; hostname: string; port: number }[];
};

@Injectable()
export class DiscoverService {
  constructor(
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(GameServer) private readonly serverRepo: Repository<GameServer>,
  ) {}

  async getDiscoverSummary(): Promise<DiscoverSummary> {
    const [resourceCount, threadCount, serverCount, recentResources, recentThreads, activeServers] = await Promise.all([
      this.resourceRepo.count({ where: { is_public: 1 as any } }),
      this.postRepo.count({ where: { status: 'published' as any } }),
      this.serverRepo.count({ where: { is_public: true } }),
      this.resourceRepo.find({
        where: { is_public: 1 as any, status: 'approved' as any },
        order: { created_at: 'DESC' }, take: 10,
        select: ['id', 'title', 'created_at'],
      }),
      this.postRepo.find({
        where: { status: 'published' as any },
        order: { created_at: 'DESC' }, take: 10,
        select: ['id', 'title', 'created_at'],
      }),
      this.serverRepo.find({
        where: { is_public: true, status: 'active' as any },
        order: { name: 'ASC' }, take: 10,
        select: ['id', 'name', 'hostname', 'port'],
      }),
    ]);

    return {
      total_resources: resourceCount,
      total_threads: threadCount,
      total_servers: serverCount,
      recent_resources: recentResources.map(r => ({ id: r.id, title: r.title, created_at: r.created_at?.toISOString() || '' })),
      recent_threads: recentThreads.map(t => ({ id: t.id, title: t.title, created_at: t.created_at?.toISOString() || '' })),
      active_servers: activeServers.map(s => ({ id: s.id, name: s.name, hostname: s.hostname, port: s.port })),
    };
  }
}
