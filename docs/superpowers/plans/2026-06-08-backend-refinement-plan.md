# Backend Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 backend refinements: post @mentions, search history/popular, BullMQ email queue, and Docker deployment.

**Architecture:** Incremental feature additions to existing NestJS codebase. Each sub-project is independent — no shared code between tasks. Follow existing patterns (TypeORM entities, NestJS modules, SQL migrations).

**Tech Stack:** NestJS v10, TypeORM 0.3, MySQL 8, ioredis 5.4, nodemailer 8, BullMQ 5, Docker.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| **Modify** | `src/modules/posts/posts.service.ts` | Add @mention handling to create() |
| **Modify** | `src/modules/posts/posts.module.ts` | Import NotificationsModule |
| **Create** | `src/entities/search-history.entity.ts` | Search history entity |
| **Create** | `src/entities/popular-search.entity.ts` | Popular search entity |
| **Modify** | `src/entities/index.ts` | Register new entities |
| **Create** | `src/modules/search/search.module.ts` | Search module |
| **Create** | `src/modules/search/search.controller.ts` | Search API controller |
| **Create** | `src/modules/search/search.service.ts` | Search business logic |
| **Create** | `src/modules/search/dto/search-query.dto.ts` | Search query validation |
| **Create** | `src/database/migrations/003_add_search_tables.sql` | DB migration |
| **Modify** | `src/app.module.ts` | Register SearchModule |
| **Modify** | `src/modules/notifications/email-queue.service.ts` | Replace with BullMQ |
| **Modify** | `package.json` | Add bullmq dependency |
| **Create** | `Dockerfile` | Backend production image |
| **Create** | `frontend/Dockerfile` | Frontend production image |
| **Create** | `docker-compose.dev.yml` | Dev orchestration |
| **Create** | `docker-compose.prod.yml` | Prod orchestration |
| **Create** | `nginx/conf.d/default.conf` | Nginx config |
| **Create** | `.dockerignore` | Docker ignore rules |
| **Modify** | `frontend/src/app/(public)/search/page.tsx` | Search history + popular UI |
| **Create** | `frontend/src/lib/api/client.ts` additions | Search API methods |

---

## Phase 1: Post @Mention Notification (最快见效)

### Task 1: Inject NotificationsService into PostsService

**Files:**
- Modify: `src/modules/posts/posts.service.ts`
- Modify: `src/modules/posts/posts.module.ts`

PostsService 已注入 EventBusService，需要再注入 NotificationsService 来调用 notifyMentionedUsers()。

- [ ] **Step 1: Add NotificationsModule import to PostsModule**

Modify `src/modules/posts/posts.module.ts`. Add NotificationsModule to imports.

```typescript
// Add this import at the top
import { NotificationsModule } from '../notifications/notifications.module';

// Add NotificationsModule to the imports array
@Module({
  imports: [
    DatabaseModule,
    PointsModule,
    GroupsModule,
    PluginsModule,
    NotificationsModule,  // <-- Add this
    TypeOrmModule.forFeature([Post, User, Category, Tag, PostTag, Reply]),
  ],
  // ... rest unchanged
})
```

- [ ] **Step 2: Inject NotificationsService into PostsService**

Modify `src/modules/posts/posts.service.ts`. Add import and constructor injection.

```typescript
// Add import near the other module imports (around line 24)
import { NotificationsService } from '../notifications/notifications.service';

// Add to constructor (after eventBus injection, around line 53)
constructor(
  // ... existing injections ...
  private eventBus: EventBusService,
  private notificationsService: NotificationsService,  // <-- Add this
) {}
```

- [ ] **Step 3: Call notifyMentionedUsers in create() after post is saved**

In the `create()` method of `posts.service.ts`, after points are awarded (around line 108), add @mention handling. This must be after the transaction commits so the post ID exists.

```typescript
// After the points award block (after line 110, before `return result;`)

// Handle @mentions in post content (only for published posts)
if (savedPost.status === 'published' && dto.content) {
  this.notificationsService.notifyMentionedUsers(
    dto.content,
    savedPost.id,
    userId,
    undefined, // replyId - not applicable for posts
    [userId],  // skipUserIds - don't notify the author
  ).catch((err) =>
    console.error('Post mention notification error:', err),
  );
}
```

**Important:** This is fire-and-forget (`.catch()` only) because we don't want mention notification failures to block the post creation response.

- [ ] **Step 4: Commit**

```bash
cd G:/MindProject/MindFourm
git add src/modules/posts/posts.service.ts src/modules/posts/posts.module.ts
git commit -m "feat: add @mention notification support to post creation"
```

---

## Phase 2: Search History + Popular Searches

### Task 2: Create Search Entities and Migration

**Files:**
- Create: `src/entities/search-history.entity.ts`
- Create: `src/entities/popular-search.entity.ts`
- Modify: `src/entities/index.ts`
- Create: `src/database/migrations/003_add_search_tables.sql`

- [ ] **Step 1: Create SearchHistory entity**

```typescript
// src/entities/search-history.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('search_history')
@Index(['user_id', 'created_at'])
@Index(['query'])
export class SearchHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number | null;

  @Column({ length: 255 })
  query: string;

  @Column({ length: 20, default: 'global' })
  search_type: string; // 'post', 'user', 'global'

  @Column({ type: 'int', default: 0 })
  results_count: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
```

- [ ] **Step 2: Create PopularSearch entity**

```typescript
// src/entities/popular-search.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('popular_searches')
@Index(['count'])
export class PopularSearch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, unique: true })
  query: string;

  @Column({ type: 'int', default: 0 })
  count: number;

  @UpdateDateColumn()
  last_searched_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
```

- [ ] **Step 3: Register entities in index.ts**

Modify `src/entities/index.ts`. Add imports and exports.

```typescript
// Add imports (after the PluginPermission import section)
import { SearchHistory } from './search-history.entity';
import { PopularSearch } from './popular-search.entity';

// Add to entities array (after PluginPermission)
export const entities = [
  // ... existing entities ...
  PluginPermission,
  EmailLog,
  SearchHistory,   // <-- Add
  PopularSearch,   // <-- Add
];

// Add to named exports
export {
  // ... existing exports ...
  PluginPermission,
  EmailLog,
  SearchHistory,   // <-- Add
  PopularSearch,   // <-- Add
};
```

- [ ] **Step 4: Create SQL migration**

```sql
-- src/database/migrations/003_add_search_tables.sql
-- Migration: Add search history and popular searches tables
-- Date: 2026-06-08

CREATE TABLE IF NOT EXISTS search_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL,
  query VARCHAR(255) NOT NULL,
  search_type ENUM('post', 'user', 'global') DEFAULT 'global',
  results_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_search_history_user_created (user_id, created_at DESC),
  INDEX idx_search_history_query (query),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='User search history';

CREATE TABLE IF NOT EXISTS popular_searches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  query VARCHAR(255) UNIQUE NOT NULL,
  count INT DEFAULT 0,
  last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_popular_searches_count (count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Popular search terms';
```

- [ ] **Step 5: Commit**

```bash
cd G:/MindProject/MindFourm
git add src/entities/search-history.entity.ts src/entities/popular-search.entity.ts src/entities/index.ts src/database/migrations/003_add_search_tables.sql
git commit -m "feat: add search history and popular search entities + migration"
```

---

### Task 3: Create Search Module (Backend)

**Files:**
- Create: `src/modules/search/search.module.ts`
- Create: `src/modules/search/search.controller.ts`
- Create: `src/modules/search/search.service.ts`
- Create: `src/modules/search/dto/search-query.dto.ts`
- Modify: `src/app.module.ts`
- Modify: `src/database/redis.service.ts` (add sorted set methods)

- [ ] **Step 1: Add sorted set methods to RedisService**

The current RedisService doesn't have `zIncrBy` or `zRevRange`. Add them.

Modify `src/database/redis.service.ts`. Add these methods before the closing brace of the class:

```typescript
// Sorted set operations for popular searches

/**
 * Increment score for a member in a sorted set
 */
async zIncrBy(key: string, increment: number, member: string): Promise<number> {
  return this.client.zincrby(key, increment, member);
}

/**
 * Get top N members from a sorted set (highest score first)
 */
async zRevRange(key: string, start: number, stop: number): Promise<string[]> {
  return this.client.zrevrange(key, start, stop);
}

/**
 * Get member score in a sorted set
 */
async zScore(key: string, member: string): Promise<number | null> {
  const score = await this.client.zscore(key, member);
  return score !== null ? parseInt(score, 10) : null;
}
```

- [ ] **Step 2: Create SearchQueryDto**

```typescript
// src/modules/search/dto/search-query.dto.ts
import { IsString, IsOptional, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @IsString()
  q: string;

  @IsOptional()
  @IsIn(['post', 'user', 'global'])
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['relevance', 'newest', 'oldest'])
  sort?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
```

- [ ] **Step 3: Create SearchService**

```typescript
// src/modules/search/search.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { RedisService } from '../../database/redis.service';
import { escapeLike } from '../../common/utils/search.util';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SearchHistory)
    private searchHistoryRepo: Repository<SearchHistory>,
    @InjectRepository(PopularSearch)
    private popularSearchRepo: Repository<PopularSearch>,
    private redisService: RedisService,
  ) {}

  async searchPosts(query: string, options: { page?: number; limit?: number; category?: string; sort?: string }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 50);

    const qb = this.postRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'user')
      .leftJoinAndSelect('p.category', 'category')
      .where('p.status = :status', { status: 'published' })
      .andWhere(
        '(p.title LIKE :query OR p.content LIKE :query)',
        { query: `%${escapeLike(query)}%` },
      );

    if (options.category) {
      qb.andWhere('category.slug = :category', { category: options.category });
    }

    if (options.sort === 'relevance') {
      qb.orderBy('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'DESC');
      qb.addOrderBy('p.created_at', 'DESC');
    } else if (options.sort === 'oldest') {
      qb.orderBy('p.created_at', 'ASC');
    } else {
      qb.orderBy('p.created_at', 'DESC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [posts, total] = await qb.getManyAndCount();

    return {
      data: posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async searchUsers(query: string, limit: number = 20) {
    return this.userRepository.find({
      where: [
        { username: Like(`%${escapeLike(query)}%`) },
        { bio: Like(`%${escapeLike(query)}%`) },
      ],
      take: limit,
      select: ['id', 'username', 'avatar_url', 'bio'],
    });
  }

  async recordSearch(userId: number | null, query: string, resultsCount: number): Promise<void> {
    // Record search history
    this.searchHistoryRepo.save({
      user_id: userId,
      query: query.toLowerCase().trim(),
      search_type: 'global',
      results_count: resultsCount,
    }).catch(() => {});

    // Update popular searches in Redis
    this.redisService.zIncrBy('search:popular', 1, query.toLowerCase().trim())
      .catch(() => {});
  }

  async getPopularSearches(limit: number = 10): Promise<string[]> {
    // Try cache first
    const cached = await this.redisService.get('search:popular:cached');
    if (cached) {
      return JSON.parse(cached);
    }

    const popular = await this.redisService.zRevRange('search:popular', 0, limit - 1);

    // Cache for 5 minutes
    this.redisService.set('search:popular:cached', JSON.stringify(popular), 300)
      .catch(() => {});

    return popular;
  }

  async getSearchHistory(userId: number, limit: number = 10): Promise<SearchHistory[]> {
    return this.searchHistoryRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  async clearSearchHistory(userId: number): Promise<void> {
    await this.searchHistoryRepo.delete({ user_id: userId });
  }
}
```

- [ ] **Step 4: Create SearchController**

```typescript
// src/modules/search/search.controller.ts
import { Controller, Get, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query() dto: SearchQueryDto) {
    const postsResult = await this.searchService.searchPosts(dto.q, {
      page: dto.page,
      limit: dto.limit,
      category: dto.category,
      sort: dto.sort,
    });

    // Record search
    // userId comes from request if authenticated
    await this.searchService.recordSearch(null, dto.q, postsResult.pagination.total);

    return {
      success: true,
      data: postsResult,
      popular_searches: await this.searchService.getPopularSearches(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(@Req() req: any) {
    const history = await this.searchService.getSearchHistory(req.user.id);
    return { success: true, data: history };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('history')
  async clearHistory(@Req() req: any) {
    await this.searchService.clearSearchHistory(req.user.id);
    return { success: true, message: 'Search history cleared' };
  }

  @Get('popular')
  async getPopular() {
    const popular = await this.searchService.getPopularSearches();
    return { success: true, data: popular };
  }
}
```

- [ ] **Step 5: Create SearchModule**

```typescript
// src/modules/search/search.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, User, SearchHistory, PopularSearch]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
```

- [ ] **Step 6: Register SearchModule in AppModule**

Modify `src/app.module.ts`. Add import and registration.

```typescript
// Add import (with other module imports)
import { SearchModule } from './modules/search/search.module';

// Add to imports array (with other modules)
SearchModule,
```

- [ ] **Step 7: Commit**

```bash
cd G:/MindProject/MindFourm
git add src/database/redis.service.ts src/modules/search/ src/app.module.ts
git commit -m "feat: add search module with history, popular searches, and sorted set Redis support"
```

---

### Task 4: Search Frontend — History + Popular

**Files:**
- Modify: `frontend/src/app/(public)/search/page.tsx`
- Modify: `frontend/src/lib/api/client.ts` (search methods already added in prior commits, verify)

The current search page is a server component. We need to add search history (client-side) and popular searches.

- [ ] **Step 1: Add search API methods to client.ts**

Verify these exist in `frontend/src/lib/api/client.ts`. If not, add:

```typescript
// Add to the existing api object or create a searchApi object
export const searchApi = {
  search: (params: { q: string; type?: string; page?: number; limit?: number }) =>
    request<PostListResponse>(`/api/search${buildQueryString(params as any)}`),
  getHistory: () => request<any[]>('/api/search/history'),
  clearHistory: () => request<any>('/api/search/history', { method: 'DELETE' }),
  getPopular: () => request<string[]>('/api/search/popular'),
};
```

- [ ] **Step 2: Convert search page to include client-side history/popular**

The current page is a server component. We'll add a client component wrapper for history/popular.

Create a new client component:

```tsx
// frontend/src/components/forum/search-enhancements.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { searchApi } from '@/lib/api/client';
import Link from 'next/link';
import { Clock, TrendingUp, X } from 'lucide-react';

export default function SearchEnhancements() {
  const [history, setHistory] = useState<string[]>([]);
  const [popular, setPopular] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [popularRes] = await Promise.all([
        searchApi.getPopular().catch(() => ({ data: [] })),
      ]);
      setPopular(popularRes.data || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClearHistory = async () => {
    await searchApi.clearHistory().catch(() => {});
    setHistory([]);
  };

  const handleClick = (query: string) => {
    window.location.href = `/search?q=${encodeURIComponent(query)}`;
  };

  if (loading) return null;

  return (
    <div className="mt-8 space-y-6">
      {history.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4" />
              最近搜索
            </h3>
            <button onClick={handleClearHistory} className="text-xs text-muted hover:text-primary">
              清空
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((q, i) => (
              <button
                key={i}
                onClick={() => handleClick(q)}
                className="px-3 py-1.5 text-sm bg-surface-100 hover:bg-surface-200 rounded-full transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {popular.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4" />
            热门搜索
          </h3>
          <div className="flex flex-wrap gap-2">
            {popular.map((q, i) => (
              <button
                key={i}
                onClick={() => handleClick(q)}
                className="px-3 py-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-colors"
              >
                {i < 3 ? '🔥 ' : ''}{q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add SearchEnhancements to search page**

Modify `frontend/src/app/(public)/search/page.tsx`. Add the client component at the bottom:

```tsx
import SearchEnhancements from '@/components/forum/search-enhancements';

// At the end of the return, before closing </div>:
<SearchEnhancements />
```

- [ ] **Step 4: Commit**

```bash
cd G:/MindProject/MindFourm
git add frontend/src/components/forum/search-enhancements.tsx frontend/src/app/\(public\)/search/page.tsx frontend/src/lib/api/client.ts
git commit -m "feat: add search history and popular searches UI"
```

---

## Phase 3: BullMQ Email Queue

### Task 5: Replace Memory Queue with BullMQ

**Files:**
- Modify: `package.json`
- Modify: `src/modules/notifications/email-queue.service.ts`

- [ ] **Step 1: Install bullmq**

```bash
cd G:/MindProject/MindFourm
npm install bullmq
```

- [ ] **Step 2: Rewrite email-queue.service.ts**

Replace the entire file with BullMQ implementation:

```typescript
// src/modules/notifications/email-queue.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { EmailService, MailOptions } from './email.service';
import { RedisService } from '../../database/redis.service';

export interface EmailJob {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private queue: Queue;
  private worker: Worker;

  constructor(
    private emailService: EmailService,
    private redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redis = this.redisService.getClient();

    this.queue = new Queue('email-queue', {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    this.worker = new Worker(
      'email-queue',
      async (job: Job<{ to: string | string[]; subject: string; html: string; text?: string }>) => {
        const { to, subject, html, text } = job.data;
        await this.emailService.sendMail({ to, subject, html, text });
      },
      {
        connection: redis,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Email sent: ${job.data.subject} -> ${job.data.to}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Email failed: ${job?.data?.subject} -> ${job?.data?.to}: ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.worker.close();
  }

  async addEmailJob(job: EmailJob): Promise<void> {
    await this.queue.add('send-email', job);
  }

  async getQueueSize(): Promise<number> {
    const jobs = await this.queue.getJobCounts('waiting', 'active');
    return jobs.waiting + jobs.active;
  }
}
```

**Key differences from current implementation:**
- `OnModuleInit` / `OnModuleDestroy` lifecycle for Queue/Worker
- Same public interface (`addEmailJob`, `getQueueSize`) — callers don't change
- Retry/backoff handled by BullMQ (not manual)
- Concurrency controlled by BullMQ (5 concurrent)

- [ ] **Step 3: Commit**

```bash
cd G:/MindProject/MindFourm
git add package.json package-lock.json src/modules/notifications/email-queue.service.ts
git commit -m "feat: replace in-memory email queue with BullMQ for persistence and reliability"
```

---

## Phase 4: Docker Deployment

### Task 6: Create Docker Configuration Files

**Files:**
- Create: `Dockerfile` (backend)
- Create: `frontend/Dockerfile`
- Create: `docker-compose.dev.yml`
- Create: `docker-compose.prod.yml`
- Create: `.dockerignore`
- Create: `frontend/.dockerignore`
- Create: `nginx/conf.d/default.conf`

- [ ] **Step 1: Create backend Dockerfile**

```dockerfile
# G:/MindProject/MindFourm/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: Create frontend Dockerfile**

```dockerfile
# G:/MindProject/MindFourm/frontend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MINDAUTH_URL
ARG NEXT_PUBLIC_MINDAUTH_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MINDAUTH_URL=$NEXT_PUBLIC_MINDAUTH_URL
ENV NEXT_PUBLIC_MINDAUTH_CLIENT_ID=$NEXT_PUBLIC_MINDAUTH_CLIENT_ID
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 3: Create .dockerignore**

```
# G:/MindProject/MindFourm/.dockerignore
node_modules
dist
uploads
logs
.env
.env.*
!.env.example
Dockerfile
docker-compose*.yml
.git
.gitignore
*.md
docs/
tests/
```

```
# G:/MindProject/MindFourm/frontend/.dockerignore
node_modules
.next
out
.env*
!.env.example
Dockerfile
```

- [ ] **Step 4: Create docker-compose.dev.yml**

```yaml
# G:/MindProject/MindFourm/docker-compose.dev.yml
version: '3.8'

services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: mindforum
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./src/database/migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      PORT: 4000
      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_USER: root
      MYSQL_PASSWORD: root
      MYSQL_DATABASE: mindforum
      REDIS_HOST: redis
      REDIS_PORT: 6379
      FRONTEND_URL: http://localhost:3000
      MINDAUTH_URL: http://localhost:4001
      MINDAUTH_CLIENT_ID: forum
      MINDAUTH_CLIENT_SECRET: ${MINDAUTH_CLIENT_SECRET:-dev-secret}
    depends_on:
      - mysql
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://localhost:4000
        NEXT_PUBLIC_MINDAUTH_URL: http://localhost:4001
        NEXT_PUBLIC_MINDAUTH_CLIENT_ID: forum
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
      NEXT_PUBLIC_MINDAUTH_URL: http://localhost:4001
      NEXT_PUBLIC_MINDAUTH_CLIENT_ID: forum
    depends_on:
      - backend

volumes:
  mysql_data:
```

- [ ] **Step 5: Create docker-compose.prod.yml**

```yaml
# G:/MindProject/MindFourm/docker-compose.prod.yml
version: '3.8'

services:
  mysql:
    image: mysql:8
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: mindforum
    volumes:
      - mysql_data:/var/lib/mysql
      - ./src/database/migrations:/docker-entrypoint-initdb.d
      - ./backups:/backups
    networks:
      - internal
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 3

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - internal
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    restart: always
    environment:
      PORT: 4000
      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_USER: root
      MYSQL_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: mindforum
      REDIS_HOST: redis
      REDIS_PORT: 6379
      FRONTEND_URL: ${FRONTEND_URL}
      MINDAUTH_URL: ${MINDAUTH_URL}
      MINDAUTH_CLIENT_ID: forum
      MINDAUTH_CLIENT_SECRET: ${MINDAUTH_CLIENT_SECRET}
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - internal
      - web
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: /api
        NEXT_PUBLIC_MINDAUTH_URL: ${MINDAUTH_URL}
        NEXT_PUBLIC_MINDAUTH_CLIENT_ID: forum
    restart: always
    environment:
      NEXT_PUBLIC_API_URL: /api
      NEXT_PUBLIC_MINDAUTH_URL: ${MINDAUTH_URL}
      NEXT_PUBLIC_MINDAUTH_CLIENT_ID: forum
    depends_on:
      - backend
    networks:
      - internal
      - web

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - backend
    networks:
      - web

volumes:
  mysql_data:
  redis_data:

networks:
  internal:
    driver: bridge
  web:
    driver: bridge
```

- [ ] **Step 6: Create Nginx config**

```nginx
# G:/MindProject/MindFourm/nginx/conf.d/default.conf

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://backend:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_set_header Connection '';
        chunked_transfer_encoding off;
    }

    # Static assets cache
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://frontend:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
}
```

- [ ] **Step 7: Commit**

```bash
cd G:/MindProject/MindFourm
git add Dockerfile frontend/Dockerfile docker-compose.dev.yml docker-compose.prod.yml .dockerignore frontend/.dockerignore nginx/conf.d/default.conf
git commit -m "feat: add Docker deployment configuration with dev/prod compose and Nginx"
```

---

## Verification

After all phases complete, verify each feature:

| Feature | Verification |
|---------|-------------|
| @Mentions | Create post with `@otheruser` → check `notifications` table for mention entry |
| Search History | Perform search → check `search_history` table → verify `/api/search/history` returns data |
| Popular Searches | Repeat same search 5+ times → `GET /api/search/popular` returns the term |
| BullMQ Queue | Trigger email → `redis-cli KEYS 'bull:*'` shows queue keys → stop/restart → queue persists |
| Docker | `docker compose -f docker-compose.dev.yml up -d` → visit `http://localhost:3000` |

---

## Self-Review

1. **Spec coverage:**
   - ✅ Post @mention notification — Task 1 (inject + call notifyMentionedUsers)
   - ✅ Search history + popular — Task 2 (entities + migration), Task 3 (search module), Task 4 (frontend)
   - ✅ BullMQ queue — Task 5 (replace email-queue.service.ts)
   - ✅ Docker deployment — Task 6 (all config files)

2. **Placeholder scan:** No TBD/TODO/fill-in patterns found.

3. **Type consistency:** All imports use existing paths (`@entities/`, `../../database/redis.service`). SearchQueryDto uses `class-validator` consistent with other DTOs. Redis sorted set methods added to existing RedisService.

4. **Scope check:** 4 independent phases, each produces working, testable code.

5. **No "similar to Task N" patterns:** Each task has complete code.
