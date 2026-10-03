import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Resource } from '@entities/resource.entity';
import { getClientIp } from '@common/utils/client-context.util';
import { PUBLIC_RESOURCE_STATUSES } from '@common/utils/constants';
import { ResourceViewEvent } from '@entities/resource-view-event.entity';

export type ResourceReferrerCategory = 'home' | 'search' | 'category' | 'profile' | 'related_resource' | 'external' | 'direct';

const VISITOR_COOKIE = 'resource_visitor_id';
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
const CRAWLER_USER_AGENT = /bot|crawler|spider|slurp|googlebot|bingbot|yandex|duckduckbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|preview|headlesschrome|lighthouse/i;

export function isResourceViewCrawler(userAgent: string | undefined): boolean {
  return Boolean(userAgent && CRAWLER_USER_AGENT.test(userAgent));
}

export function classifyResourceReferrer(
  referrer: string | undefined,
  requestHost: string | undefined,
  configuredSiteUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL,
): ResourceReferrerCategory {
  if (!referrer) return 'direct';

  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return 'external';
  }

  const referrerHost = url.hostname.toLowerCase();
  const hosts = new Set<string>(['mdtbbs.cn', 'mindustry.club']);
  if (requestHost) hosts.add(requestHost.toLowerCase().split(':')[0]);
  try {
    if (configuredSiteUrl) hosts.add(new URL(configuredSiteUrl).hostname.toLowerCase());
  } catch {
    // An invalid optional site URL does not make the request fail.
  }
  const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const sameSite = hosts.has(referrerHost)
    || (isLocalHost(referrerHost) && [...hosts].some(isLocalHost))
    || [...hosts].some((host) => host.endsWith('.mdtbbs.cn') && (referrerHost === 'mdtbbs.cn' || referrerHost.endsWith('.mdtbbs.cn')))
    || [...hosts].some((host) => host.endsWith('.mindustry.club') && (referrerHost === 'mindustry.club' || referrerHost.endsWith('.mindustry.club')));
  if (!sameSite) return 'external';

  if (url.pathname === '/' || url.pathname === '') return 'home';
  if (url.pathname === '/search' || url.pathname.startsWith('/search/')) return 'search';
  if (url.pathname.startsWith('/users/')) return 'profile';
  if (url.pathname === '/resources' && (url.searchParams.has('category_id') || url.searchParams.has('category'))) return 'category';
  if (/^\/resources\/\d+(?:-|\/|$)/.test(url.pathname)) return 'related_resource';
  return 'direct';
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readVisitorCookie(request: Request): string | undefined {
  const value = (request as Request & { cookies?: Record<string, string> }).cookies?.[VISITOR_COOKIE];
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
}

@Injectable()
export class ResourceViewsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceViewsService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.cleanupTimer = setInterval(() => void this.cleanupExpiredRows(), 6 * 60 * 60 * 1000);
    this.cleanupTimer.unref();
    void this.cleanupExpiredRows();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private async cleanupExpiredRows(): Promise<void> {
    try {
      await this.dataSource.query('DELETE FROM resource_view_dedup WHERE last_viewed_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
      // Ninety-one days covers the longest supported dashboard range plus its boundary.
      await this.dataSource.query('DELETE FROM resource_view_events WHERE created_at < DATE_SUB(NOW(), INTERVAL 91 DAY)');
    } catch (error) {
      this.logger.warn(`Resource view retention cleanup failed: ${(error as Error).message}`);
    }
  }

  async recordRequest(resource: Resource, request: Request, response: Response): Promise<boolean> {
    const userId = Number((request as Request & { user?: { id?: number } }).user?.id);
    const userAgent = String(request.headers['user-agent'] || '');
    if (!resource || Number(resource.is_public) !== 1 || !PUBLIC_RESOURCE_STATUSES.includes(resource.status as any)) return false;
    if (Number.isInteger(userId) && userId > 0 && userId === Number(resource.user_id)) return false;
    if (isResourceViewCrawler(userAgent)) return false;

    const existingVisitorId = readVisitorCookie(request);
    const visitorId = existingVisitorId || randomUUID();
    if (!existingVisitorId) {
      response.cookie(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: Boolean(request.secure || request.headers['x-forwarded-proto'] === 'https'),
        maxAge: VISITOR_COOKIE_MAX_AGE,
        path: '/',
      });
    }

    const clientIp = getClientIp(request);
    const visitorKeys = [`cookie:${visitorId}`];
    if (!existingVisitorId) visitorKeys.push(`ipua:${clientIp || 'unknown'}:${userAgent}`);
    const requestHost = request.get('host') || request.headers.host;
    return this.recordView({
      resourceId: Number(resource.id),
      ownerUserId: Number(resource.user_id),
      userId: Number.isInteger(userId) && userId > 0 ? userId : null,
      visitorKeys,
      userAgent,
      referrerCategory: classifyResourceReferrer(request.get('referer'), requestHost),
      viewedAt: new Date(),
    });
  }

  async recordView(input: {
    resourceId: number;
    ownerUserId: number;
    userId: number | null;
    visitorKeys: string[];
    userAgent: string;
    referrerCategory: ResourceReferrerCategory;
    viewedAt: Date;
  }): Promise<boolean> {
    if (!Number.isInteger(input.resourceId) || input.resourceId <= 0) return false;
    if (input.userId !== null && input.userId === input.ownerUserId) return false;
    if (isResourceViewCrawler(input.userAgent)) return false;

    const visitorHash = hash(input.visitorKeys[0] || 'unknown-visitor');
    const dedupKeys = [...new Set(input.visitorKeys.map((key) => hash(`${input.resourceId}:${hash(key)}`)))].sort();
    const queryRunner = this.dataSource.createQueryRunner();
    let transactionStarted = false;
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;
      for (const dedupKey of dedupKeys) {
        await queryRunner.query(
          'INSERT IGNORE INTO resource_view_dedup (dedup_key, last_viewed_at) VALUES (?, ?)',
          [dedupKey, new Date('1970-01-01T00:00:00.000Z')],
        );
      }
      const rows = await queryRunner.query(
        `SELECT last_viewed_at > DATE_SUB(?, INTERVAL 1 HOUR) AS is_recent
         FROM resource_view_dedup WHERE dedup_key IN (${dedupKeys.map(() => '?').join(',')}) FOR UPDATE`,
        [input.viewedAt, ...dedupKeys],
      );
      if ((rows || []).some((row: any) => Number(row.is_recent) === 1)) {
        await queryRunner.commitTransaction();
        transactionStarted = false;
        return false;
      }

      await queryRunner.query(
        `UPDATE resource_view_dedup SET last_viewed_at = ? WHERE dedup_key IN (${dedupKeys.map(() => '?').join(',')})`,
        [input.viewedAt, ...dedupKeys],
      );
      await queryRunner.manager.insert(ResourceViewEvent, {
        resource_id: input.resourceId,
        visitor_hash: visitorHash,
        user_id: input.userId,
        referrer_category: input.referrerCategory,
        created_at: input.viewedAt,
      });
      const aggregate = await queryRunner.manager.increment(Resource, { id: input.resourceId }, 'view_count', 1);
      if (aggregate.affected === 0) throw new Error('resource missing while recording view');
      await queryRunner.commitTransaction();
      transactionStarted = false;
      return true;
    } catch (error) {
      if (transactionStarted) await queryRunner.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      await queryRunner.release().catch(() => undefined);
    }
  }

  async getAnalytics(rangeDays: 1 | 7 | 30 | 90, resourceId?: number) {
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const resourceClause = resourceId ? ' AND resource_id = ?' : '';
    const params: unknown[] = resourceId ? [since, resourceId] : [since];
    const eventScope = `created_at >= ?${resourceClause}`;
    const [totalsRows, dailyRows, referrerRows] = await Promise.all([
      this.dataSource.query(`
        SELECT COUNT(*) AS views_pv, COUNT(DISTINCT visitor_hash) AS views_uv
        FROM resource_view_events WHERE ${eventScope}
      `, params),
      this.dataSource.query(`
        SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS views_pv, COUNT(DISTINCT visitor_hash) AS views_uv
        FROM resource_view_events WHERE ${eventScope}
        GROUP BY DATE(created_at) ORDER BY day ASC
      `, params),
      this.dataSource.query(`
        SELECT referrer_category, COUNT(*) AS count
        FROM resource_view_events WHERE ${eventScope}
        GROUP BY referrer_category ORDER BY count DESC
      `, params),
    ]);

    const interactionParams = resourceId ? [since, resourceId, since, resourceId, since, resourceId, since, resourceId, since, resourceId] : Array(5).fill(since);
    const interactionResourceClause = resourceId ? ' AND resource_id = ?' : '';
    const discussionResourceClause = resourceId ? ' AND resource.id = ?' : '';
    const interactionRows = await this.dataSource.query(`
      SELECT
        (SELECT COUNT(*) FROM download_events WHERE event_type = 'granted' AND created_at >= ?${interactionResourceClause}) AS downloads,
        (SELECT COUNT(*) FROM resource_favorites WHERE created_at >= ?${interactionResourceClause}) AS favorites,
        (SELECT COUNT(*) FROM resource_likes WHERE created_at >= ?${interactionResourceClause}) AS likes,
        (SELECT COUNT(*) FROM resource_ratings WHERE created_at >= ?${interactionResourceClause}) AS ratings,
        (SELECT COUNT(*) FROM replies reply
          INNER JOIN resources resource ON resource.discussion_thread_id = reply.post_id
         WHERE reply.status = 'published' AND reply.created_at >= ?${discussionResourceClause}) AS comments
    `, interactionParams);

    const totals = totalsRows?.[0] || {};
    const interactions = interactionRows?.[0] || {};
    const pv = Number(totals.views_pv || 0);
    const downloads = Number(interactions.downloads || 0);
    return {
      range_days: rangeDays,
      since: since.toISOString(),
      views: { pv, uv: Number(totals.views_uv || 0) },
      downloads,
      download_conversion_percent: pv ? Math.round((downloads / pv) * 10_000) / 100 : 0,
      favorites: Number(interactions.favorites || 0),
      likes: Number(interactions.likes || 0),
      ratings: Number(interactions.ratings || 0),
      comments: Number(interactions.comments || 0),
      daily: (dailyRows || []).map((row: any) => ({ day: String(row.day).slice(0, 10), pv: Number(row.views_pv || 0), uv: Number(row.views_uv || 0) })),
      referrers: (referrerRows || []).map((row: any) => ({ category: row.referrer_category, count: Number(row.count || 0) })),
    };
  }
}
