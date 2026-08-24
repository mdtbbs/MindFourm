import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Notice, NoticeStatus, NoticeType } from '@entities/notice.entity';
import { NoticeRevision } from '@entities/notice-revision.entity';
import { User } from '@entities/user.entity';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { parseMarkdown } from '@common/utils/markdown.util';
import { RedisService } from '../../database/redis.service';
import { LogsService } from '../logs/logs.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

const PUBLIC_STATUSES: NoticeStatus[] = ['published'];

@Injectable()
export class NoticesService {
  constructor(
    @InjectRepository(Notice) private readonly noticeRepository: Repository<Notice>,
    @InjectRepository(NoticeRevision) private readonly revisionRepository: Repository<NoticeRevision>,
    private readonly redisService: RedisService,
    private readonly logsService: LogsService,
  ) {}

  async listPublic(params: { limit?: number; offset?: number; type?: NoticeType; pinned?: boolean }) {
    const limit = Math.max(1, Math.min(params.limit || 20, 50));
    const query = this.noticeRepository.createQueryBuilder('notice')
      .leftJoinAndSelect('notice.author', 'author')
      .where('notice.deleted_at IS NULL')
      .andWhere('notice.status IN (:...statuses)', { statuses: PUBLIC_STATUSES })
      .andWhere('notice.published_at IS NOT NULL AND notice.published_at <= NOW()');
    if (params.type) query.andWhere('notice.notice_type = :type', { type: params.type });
    if (params.pinned !== undefined) query.andWhere('notice.is_pinned = :pinned', { pinned: params.pinned ? 1 : 0 });
    const rows = await query
      .orderBy('notice.is_pinned', 'DESC')
      .addOrderBy('notice.published_at', 'DESC')
      .addOrderBy('notice.id', 'DESC')
      .skip(Math.max(0, params.offset || 0))
      .take(limit + 1)
      .getMany();
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((notice) => this.toSummary(notice));
    return { data, pagination: { limit, offset: Math.max(0, params.offset || 0), next_offset: hasMore ? Math.max(0, params.offset || 0) + limit : null, has_more: hasMore } };
  }

  async getPublic(id: string, clientIp: string) {
    const notice = await this.findVisible(id);
    await this.incrementViewCount(notice.id, clientIp);
    const [revisions, related] = await Promise.all([
      this.revisionRepository.find({
        where: { notice_id: notice.id }, relations: ['editor'], order: { created_at: 'DESC', id: 'DESC' }, take: 10,
      }),
      this.findRelated(notice),
    ]);
    return {
      ...this.toDetail(notice),
      revisions: revisions.map((revision) => ({
        id: revision.id,
        change_summary: revision.change_summary,
        created_at: revision.created_at,
        editor: revision.editor ? this.toPublicUser(revision.editor) : null,
      })),
      related,
    };
  }

  async listAdmin() {
    const rows = await this.noticeRepository.find({ relations: ['author'], withDeleted: false, order: { created_at: 'DESC', id: 'DESC' }, take: 100 });
    return rows.map((notice) => this.toDetail(notice));
  }

  async create(dto: CreateNoticeDto, authorUserId: number, audit?: { ip?: string; userAgent?: string }) {
    const status = dto.status || 'published';
    const publishedAt = dto.published_at ? new Date(dto.published_at) : status === 'published' ? new Date() : null;
    const notice = this.noticeRepository.create({
      public_id: randomUUID(), title: dto.title.trim(), excerpt: this.normalizeExcerpt(dto.excerpt, dto.content_markdown),
      content_markdown: dto.content_markdown, content_html: parseMarkdown(dto.content_markdown),
      notice_type: dto.notice_type || 'system', status, author_user_id: authorUserId,
      is_pinned: dto.is_pinned ? 1 : 0, pinned_at: dto.is_pinned ? new Date() : null, published_at: publishedAt,
      edited_at: null, view_count: 0,
    });
    const saved = await this.noticeRepository.save(notice);
    await this.log(authorUserId, 'notice.create', saved, audit);
    return this.toDetail(saved);
  }

  async update(id: string, dto: UpdateNoticeDto, editorId: number, audit?: { ip?: string; userAgent?: string }) {
    const notice = await this.findAny(id);
    const semanticChange = ['title', 'content_markdown', 'excerpt', 'notice_type'].some((key) => key in dto);
    if (semanticChange) {
      await this.revisionRepository.save(this.revisionRepository.create({
        notice_id: notice.id, editor_id: editorId, title: notice.title, content_markdown: notice.content_markdown,
        excerpt: notice.excerpt, notice_type: notice.notice_type, change_summary: dto.change_summary?.trim() || null,
      }));
    }
    if (dto.title !== undefined) notice.title = dto.title.trim();
    if (dto.content_markdown !== undefined) {
      notice.content_markdown = dto.content_markdown;
      notice.content_html = parseMarkdown(dto.content_markdown);
    }
    if (dto.excerpt !== undefined) notice.excerpt = this.normalizeExcerpt(dto.excerpt, notice.content_markdown);
    if (dto.notice_type !== undefined) notice.notice_type = dto.notice_type;
    if (dto.status !== undefined) notice.status = dto.status;
    if (dto.published_at !== undefined) notice.published_at = dto.published_at ? new Date(dto.published_at) : null;
    if (dto.status === 'published' && !notice.published_at) notice.published_at = new Date();
    if (dto.is_pinned !== undefined) {
      notice.is_pinned = dto.is_pinned ? 1 : 0;
      notice.pinned_at = dto.is_pinned ? (notice.pinned_at || new Date()) : null;
    }
    if (semanticChange) notice.edited_at = new Date();
    const saved = await this.noticeRepository.save(notice);
    await this.log(editorId, 'notice.update', saved, audit);
    return this.toDetail(saved);
  }

  async softDelete(id: string, editorId: number, audit?: { ip?: string; userAgent?: string }): Promise<void> {
    const notice = await this.findAny(id);
    await this.noticeRepository.softDelete(notice.id);
    await this.log(editorId, 'notice.delete', notice, audit);
  }

  private async findVisible(id: string): Promise<Notice> {
    const query = this.noticeRepository.createQueryBuilder('notice').leftJoinAndSelect('notice.author', 'author')
      .where('notice.deleted_at IS NULL').andWhere('notice.status = :status', { status: 'published' })
      .andWhere('notice.published_at IS NOT NULL AND notice.published_at <= NOW()');
    this.idCondition(query, id);
    const notice = await query.getOne();
    if (!notice) throw new ApiV1Exception('NOTICE_NOT_FOUND', 404, '公告不存在或不可见');
    return notice;
  }

  private async findAny(id: string): Promise<Notice> {
    const query = this.noticeRepository.createQueryBuilder('notice').withDeleted();
    this.idCondition(query, id);
    const notice = await query.getOne();
    if (!notice) throw new ApiV1Exception('NOTICE_NOT_FOUND', 404, '公告不存在');
    return notice;
  }

  private idCondition(query: any, id: string): void {
    if (/^\d+$/.test(id)) query.andWhere('notice.id = :id', { id: Number(id) });
    else query.andWhere('notice.public_id = :publicId', { publicId: id });
  }

  private async findRelated(notice: Notice) {
    const rows = await this.noticeRepository.createQueryBuilder('notice')
      .leftJoinAndSelect('notice.author', 'author')
      .where('notice.id <> :id', { id: notice.id }).andWhere('notice.deleted_at IS NULL')
      .andWhere('notice.status = :status', { status: 'published' })
      .andWhere('notice.published_at IS NOT NULL AND notice.published_at <= NOW()')
      .andWhere('notice.notice_type = :type', { type: notice.notice_type })
      .orderBy('notice.is_pinned', 'DESC').addOrderBy('notice.published_at', 'DESC').take(4).getMany();
    return rows.map((item) => this.toSummary(item));
  }

  private async incrementViewCount(noticeId: number, clientIp: string): Promise<void> {
    const key = `view:notice:${noticeId}:ip:${clientIp || 'unknown'}`;
    if (await this.redisService.exists(key)) return;
    await this.redisService.set(key, '1', 60);
    await this.noticeRepository.increment({ id: noticeId }, 'view_count', 1);
  }

  private normalizeExcerpt(excerpt: string | null | undefined, markdown: string): string | null {
    const value = (excerpt || markdown.replace(/[#*_>`\[\]()]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 500);
    return value || null;
  }

  private async log(userId: number, action: string, notice: Notice, audit?: { ip?: string; userAgent?: string }) {
    await this.logsService.log({ user_id: userId, action, target_type: 'notice', target_id: notice.id,
      details: JSON.stringify({ public_id: notice.public_id, title: notice.title, status: notice.status }),
      ip_address: audit?.ip, user_agent: audit?.userAgent }).catch(() => undefined);
  }

  private toPublicUser(user: User) { return { id: user.id, username: user.username, avatar_url: user.avatar_url, role: user.role }; }
  private toSummary(notice: Notice) {
    return { id: notice.id, public_id: notice.public_id, slug: notice.slug, title: notice.title, excerpt: notice.excerpt,
      notice_type: notice.notice_type, is_pinned: !!notice.is_pinned, published_at: notice.published_at, edited_at: notice.edited_at,
      view_count: notice.view_count, author: notice.author ? this.toPublicUser(notice.author) : null };
  }
  private toDetail(notice: Notice) { return { ...this.toSummary(notice), status: notice.status, content_markdown: notice.content_markdown, content_html: notice.content_html, created_at: notice.created_at, updated_at: notice.updated_at }; }
}
