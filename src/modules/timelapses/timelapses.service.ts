import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { TimelapseReport } from '../../entities/timelapse-report.entity';
import { User } from '../../entities/user.entity';
import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { LogsService } from '../logs/logs.service';
import { PointsService } from '../points/points.service';
import { BansService } from '../bans/bans.service';
import { PostsService } from '../posts/posts.service';
import { TimelapseStorageService } from './timelapse-storage.service';
import { TimelapseQueueService } from './timelapse-queue.service';
import { TimelapseRefsService } from './timelapse-refs.service';
import {
  sanitizeFailureCode, sanitizeFailureReason, sanitizeTimelapseHighlights, sanitizeTimelapseMetrics,
} from './timelapse-result.util';
import {
  TIMELAPSE_CONCURRENT_LIMIT, TIMELAPSE_DAILY_UPLOAD_LIMIT, TIMELAPSE_DRAFT_TTL_DAYS,
  TIMELAPSE_HOURLY_UPLOAD_LIMIT, TIMELAPSE_MAX_POSTER_BYTES, TIMELAPSE_MAX_SOURCE_BYTES,
  TIMELAPSE_MAX_VIDEO_BYTES, TIMELAPSE_SOURCE_PURGE_HOURS, TIMELAPSE_UNBOUND_DRAFT_LIMIT,
  isSafePublicId, timelapsePosterKey, timelapseSourceKey, timelapseVideoKey,
  type TimelapseHighlights, type TimelapseMetricPoint, type TimelapsePublicDto,
  type TimelapseRenderResult, type TimelapseStatus,
} from './timelapse.constants';

export type TimelapseViewer = { id: number; role: string } | null | undefined;

type ReviewContext = { ipAddress?: string; userAgent?: string };

const STAFF_ROLES = new Set(['moderator', 'admin', 'super_admin']);

/**
 * 基地延时战报控制面。
 *
 * 上传会话与成片共用一行 `timelapse_reports`：`uploading` 只保存原始帧包，
 * commit 后进入 Redis 队列；Worker 通过签名内部接口回写成片与图表摘要。
 * 所有读写都经过显式可见性判断，未通过审核的战报对非作者一律 404。
 */
@Injectable()
export class TimelapsesService {
  private readonly logger = new Logger(TimelapsesService.name);

  constructor(
    @InjectRepository(TimelapseReport) private readonly reports: Repository<TimelapseReport>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly storage: TimelapseStorageService,
    private readonly queue: TimelapseQueueService,
    private readonly refs: TimelapseRefsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly adminNotifications: AdminNotificationsService,
    private readonly logs: LogsService,
    private readonly points: PointsService,
    private readonly bans: BansService,
    @Optional() private readonly posts?: PostsService,
  ) {}

  // ---------------------------------------------------------------------------
  // 上传与提交
  // ---------------------------------------------------------------------------

  async createUpload(userId: number): Promise<{ id: string; upload_url: string; expires_at: string; max_bytes: number }> {
    await this.assertEnabled();
    const publicId = randomUUID();
    const sourceKey = timelapseSourceKey(publicId)!;
    const expiresAt = new Date(Date.now() + TIMELAPSE_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.dataSource.transaction(async (manager) => {
      // 锁住用户行，串行化同一账号的额度判断，避免并发创建同时通过。
      const [user] = await manager.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      if (!user) {
        throw new ApiV1Exception('TIMELAPSE_AUTHOR_NOT_FOUND', HttpStatus.NOT_FOUND, '账号不存在。');
      }
      const [unbound] = await manager.query(
        'SELECT COUNT(*) AS count FROM timelapse_reports WHERE author_user_id = ? AND bound_post_count = 0 AND deleted_at IS NULL',
        [userId],
      );
      if (Number(unbound?.count || 0) >= TIMELAPSE_UNBOUND_DRAFT_LIMIT) {
        throw new ApiV1Exception('TIMELAPSE_DRAFT_LIMIT_EXCEEDED', HttpStatus.TOO_MANY_REQUESTS,
          `未绑定帖子的延时草稿最多 ${TIMELAPSE_UNBOUND_DRAFT_LIMIT} 个。`, false, [{ limit: TIMELAPSE_UNBOUND_DRAFT_LIMIT }]);
      }
      const [hourly] = await manager.query(
        'SELECT COUNT(*) AS count FROM timelapse_reports WHERE author_user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
        [userId],
      );
      if (Number(hourly?.count || 0) >= TIMELAPSE_HOURLY_UPLOAD_LIMIT) {
        throw new ApiV1Exception('TIMELAPSE_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS,
          `每账号每小时最多提交 ${TIMELAPSE_HOURLY_UPLOAD_LIMIT} 次延时战报。`, true, [{ window: 'hour', limit: TIMELAPSE_HOURLY_UPLOAD_LIMIT }]);
      }
      const [daily] = await manager.query(
        'SELECT COUNT(*) AS count FROM timelapse_reports WHERE author_user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)',
        [userId],
      );
      if (Number(daily?.count || 0) >= TIMELAPSE_DAILY_UPLOAD_LIMIT) {
        throw new ApiV1Exception('TIMELAPSE_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS,
          `每账号每日最多提交 ${TIMELAPSE_DAILY_UPLOAD_LIMIT} 次延时战报。`, true, [{ window: 'day', limit: TIMELAPSE_DAILY_UPLOAD_LIMIT }]);
      }
      const [active] = await manager.query(
        "SELECT COUNT(*) AS count FROM timelapse_reports WHERE author_user_id = ? AND status IN ('uploading','queued','processing') AND deleted_at IS NULL",
        [userId],
      );
      if (Number(active?.count || 0) >= TIMELAPSE_CONCURRENT_LIMIT) {
        throw new ApiV1Exception('TIMELAPSE_CONCURRENT_LIMIT', HttpStatus.TOO_MANY_REQUESTS,
          '同一账号同时只能有 1 个处理中的延时战报。', true, [{ limit: TIMELAPSE_CONCURRENT_LIMIT }]);
      }

      await manager.insert(TimelapseReport, {
        public_id: publicId,
        author_user_id: userId,
        status: 'uploading',
        visibility: 'public',
        map_name: '',
        map_width: null,
        map_height: null,
        game_mode: null,
        game_version: null,
        is_multiplayer: false,
        max_wave: 0,
        duration_seconds: 0,
        frame_count: 0,
        source_object_key: sourceKey,
        source_sha256: null,
        source_size_bytes: null,
        source_purge_after: null,
        video_object_key: null,
        poster_object_key: null,
        summary_metrics_json: null,
        highlights_json: null,
        bound_post_count: 0,
        expires_at: expiresAt,
        reviewed_by_user_id: null,
        reviewed_at: null,
        review_reason: null,
        failure_code: null,
        failure_reason: null,
        deleted_at: null,
      } as Partial<TimelapseReport>);
    });

    return {
      id: publicId,
      upload_url: `/api/v1/timelapses/uploads/${publicId}/file`,
      expires_at: expiresAt.toISOString(),
      max_bytes: TIMELAPSE_MAX_SOURCE_BYTES,
    };
  }

  async receiveUpload(userId: number, publicId: string, source: NodeJS.ReadableStream) {
    await this.assertEnabled();
    const report = await this.findOwned(publicId, userId);
    if (['queued', 'processing', 'pending_review', 'published'].includes(report.status)) {
      throw new ApiV1Exception('TIMELAPSE_ALREADY_COMMITTED', HttpStatus.CONFLICT, '该战报已经提交渲染，不能覆盖原始帧包。');
    }
    if (report.status !== 'uploading') {
      throw new ApiV1Exception('TIMELAPSE_UPLOAD_NOT_OPEN', HttpStatus.CONFLICT, '该战报当前不接受上传。');
    }
    if (report.created_at && Date.now() - new Date(report.created_at).getTime() > 24 * 60 * 60 * 1000) {
      throw new ApiV1Exception('TIMELAPSE_UPLOAD_EXPIRED', HttpStatus.GONE, '上传会话已过期。');
    }
    const objectKey = report.source_object_key || timelapseSourceKey(publicId)!;
    try {
      const stored = await this.storage.writeStream(objectKey, source as any, { maxBytes: TIMELAPSE_MAX_SOURCE_BYTES });
      await this.reports.update({ id: report.id }, {
        source_object_key: objectKey,
        source_sha256: stored.sha256,
        source_size_bytes: String(stored.size),
        updated_at: new Date(),
      });
      return { id: publicId, uploaded: true, size_bytes: stored.size, sha256: stored.sha256, max_bytes: TIMELAPSE_MAX_SOURCE_BYTES };
    } catch (error: any) {
      if (error?.code === 'TIMELAPSE_FILE_TOO_LARGE') {
        throw new ApiV1Exception('TIMELAPSE_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE,
          `原始帧包不能超过 ${Math.round(TIMELAPSE_MAX_SOURCE_BYTES / 1024 / 1024)} MB。`);
      }
      if (error?.code === 'TIMELAPSE_STORAGE_UNAVAILABLE') {
        throw new ApiV1Exception('TIMELAPSE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '延时摄影存储暂时不可用。', true);
      }
      throw error;
    }
  }

  async commit(userId: number, publicId: string, body: { sha256?: string }) {
    await this.assertEnabled();
    const report = await this.findOwned(publicId, userId);
    if (['queued', 'processing', 'pending_review', 'published'].includes(report.status)) {
      return { id: publicId, status: report.status, idempotent: true };
    }
    if (report.status !== 'uploading') {
      throw new ApiV1Exception('TIMELAPSE_NOT_COMMITTABLE', HttpStatus.CONFLICT, '该战报当前不能提交渲染。');
    }
    if (!report.source_object_key || !report.source_sha256) {
      throw new ApiV1Exception('TIMELAPSE_UPLOAD_INCOMPLETE', HttpStatus.CONFLICT, '请先上传完整的 .mreplay.zip 帧包。');
    }
    if (body.sha256 && body.sha256 !== report.source_sha256) {
      throw new ApiV1Exception('TIMELAPSE_CHECKSUM_MISMATCH', HttpStatus.CONFLICT, 'SHA-256 与已上传文件不一致。');
    }
    const info = await this.storage.statObject(report.source_object_key);
    if (!info.exists || !info.size) {
      throw new ApiV1Exception('TIMELAPSE_UPLOAD_INCOMPLETE', HttpStatus.CONFLICT, '原始帧包尚未完整写入。');
    }
    // 只做基础头校验：中央目录、路径穿越、图片炸弹等深检在 Worker 沙箱完成。
    const prefix = await this.storage.readPrefix(report.source_object_key, 4);
    if (prefix.length < 4 || prefix[0] !== 0x50 || prefix[1] !== 0x4b || prefix[2] !== 0x03 || prefix[3] !== 0x04) {
      throw new ApiV1Exception('TIMELAPSE_INVALID_ARCHIVE', HttpStatus.BAD_REQUEST, '上传的文件不是有效的 .mreplay.zip（ZIP）文件。');
    }

    const updated = await this.reports.update(
      { id: report.id, status: 'uploading' },
      { status: 'queued', updated_at: new Date() },
    );
    if (!updated.affected) {
      const current = await this.reports.findOne({ where: { id: report.id } });
      return { id: publicId, status: current?.status ?? 'queued', idempotent: true };
    }
    try {
      await this.queue.enqueue({
        timelapseId: publicId,
        authorUserId: userId,
        sourceSha256: report.source_sha256,
        sourceSizeBytes: Number(report.source_size_bytes || info.size),
      });
    } catch (error) {
      await this.reports.update({ id: report.id, status: 'queued' }, { status: 'uploading', updated_at: new Date() }).catch(() => undefined);
      throw error;
    }
    return { id: publicId, status: 'queued' };
  }

  // ---------------------------------------------------------------------------
  // 读取
  // ---------------------------------------------------------------------------

  async getReport(publicId: string, viewer: TimelapseViewer): Promise<TimelapsePublicDto> {
    const report = await this.findByPublicId(publicId);
    this.assertVisible(report, viewer);
    const author = await this.users.findOne({
      where: { id: report.author_user_id },
      select: { id: true, username: true, avatar_url: true },
    });
    return this.serialize(report, viewer, author);
  }

  async getVideo(publicId: string, viewer: TimelapseViewer) {
    const report = await this.findByPublicId(publicId);
    this.assertVisible(report, viewer);
    if (!report.video_object_key) throw this.notFound();
    return { report, objectKey: report.video_object_key };
  }

  async getPoster(publicId: string, viewer: TimelapseViewer) {
    const report = await this.findByPublicId(publicId);
    this.assertVisible(report, viewer);
    if (!report.poster_object_key) throw this.notFound();
    return { report, objectKey: report.poster_object_key };
  }

  async openObject(objectKey: string, range?: { start: number; end: number }) {
    return this.storage.openObject(objectKey, range);
  }

  /** 内部签名接口专用：签名本身即授权，不做用户可见性判断。 */
  async getInternalSource(publicId: string): Promise<{ report: TimelapseReport; objectKey: string }> {
    const report = await this.findByPublicId(publicId);
    if (!report.source_object_key) {
      throw new ApiV1Exception('TIMELAPSE_SOURCE_GONE', HttpStatus.GONE, '原始帧包已被销毁。');
    }
    return { report, objectKey: report.source_object_key };
  }

  // ---------------------------------------------------------------------------
  // 草稿帖
  // ---------------------------------------------------------------------------

  async createDraftPost(userId: number, publicId: string, dto: { title?: string; category_id?: number }) {
    await this.assertEnabled();
    if (!this.posts) {
      throw new ApiV1Exception('TIMELAPSE_DRAFT_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '帖子服务暂时不可用。', true);
    }
    const report = await this.findOwned(publicId, userId);
    if (!['published', 'pending_review'].includes(report.status)) {
      throw new ApiV1Exception('TIMELAPSE_NOT_READY', HttpStatus.CONFLICT, '战报尚未生成完成，暂时不能创建草稿帖。');
    }
    const title = (dto.title?.trim() || `基地延时战报：${report.map_name || '未命名地图'}`).slice(0, 200);
    const contentJson = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '由基地延时摄影自动生成的战报草稿，可直接编辑后发布。' }] },
        { type: 'battleReport', attrs: { timelapsePublicId: publicId } },
      ],
    };
    const post = await this.posts.create({
      title,
      content_json: contentJson,
      content_schema_version: 2,
      status: 'draft',
      category_id: dto.category_id,
    } as any, userId, { source: 'USER' });
    if (!post) {
      throw new ApiV1Exception('TIMELAPSE_DRAFT_FAILED', HttpStatus.INTERNAL_SERVER_ERROR, '草稿创建失败，请稍后重试。', true);
    }
    return { post_id: post.id, title: post.title, status: post.status };
  }

  // ---------------------------------------------------------------------------
  // 审核
  // ---------------------------------------------------------------------------

  async review(
    adminUserId: number,
    publicId: string,
    decision: 'approve' | 'reject',
    reason: string | undefined,
    context: ReviewContext = {},
  ) {
    const report = await this.findByPublicId(publicId);
    if (report.status !== 'pending_review') {
      throw new ApiV1Exception('TIMELAPSE_NOT_REVIEWABLE', HttpStatus.CONFLICT, '该战报当前不在待审核状态。', false, [{ status: report.status }]);
    }
    const normalizedReason = reason?.trim() || null;
    if (decision === 'reject' && !normalizedReason) {
      throw new ApiV1Exception('TIMELAPSE_REVIEW_REASON_REQUIRED', HttpStatus.BAD_REQUEST, '驳回战报时必须填写审核说明。');
    }
    const status: TimelapseStatus = decision === 'approve' ? 'published' : 'rejected';
    await this.reports.update({ id: report.id }, {
      status,
      reviewed_by_user_id: adminUserId,
      reviewed_at: new Date(),
      review_reason: normalizedReason?.slice(0, 500) ?? null,
      updated_at: new Date(),
    });
    await this.logs.log({
      user_id: adminUserId,
      action: `timelapse.review.${decision}`,
      target_type: 'timelapse',
      target_id: Number(report.id),
      details: JSON.stringify({ public_id: publicId, decision, reason: normalizedReason }),
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
    }).catch((error) => this.logger.warn(`延时战报审计日志写入失败: ${error?.message || error}`));

    await this.notifyAuthor(
      report.author_user_id,
      decision === 'approve'
        ? `你的基地延时战报《${report.map_name || '未命名地图'}》已通过审核并发布。`
        : `你的基地延时战报《${report.map_name || '未命名地图'}》未通过审核。${normalizedReason ? `原因：${normalizedReason}` : ''}`,
    );
    return { id: publicId, status, reviewed_at: new Date().toISOString(), review_reason: normalizedReason };
  }

  // ---------------------------------------------------------------------------
  // Worker 回写（签名内部接口调用）
  // ---------------------------------------------------------------------------

  async markProcessing(publicId: string): Promise<{ id: string; status: string }> {
    const report = await this.findByPublicId(publicId);
    if (['pending_review', 'published', 'rejected', 'failed'].includes(report.status)) {
      return { id: publicId, status: report.status };
    }
    await this.reports.update({ id: report.id, status: 'queued' }, { status: 'processing', updated_at: new Date() });
    return { id: publicId, status: 'processing' };
  }

  async writeArtifact(publicId: string, kind: 'video' | 'poster', source: NodeJS.ReadableStream) {
    const report = await this.findByPublicId(publicId);
    if (!['queued', 'processing'].includes(report.status)) {
      throw new ApiV1Exception('TIMELAPSE_NOT_RENDERING', HttpStatus.CONFLICT, '该战报当前不接受渲染产物。');
    }
    const objectKey = kind === 'video' ? timelapseVideoKey(publicId)! : timelapsePosterKey(publicId)!;
    const maxBytes = kind === 'video' ? TIMELAPSE_MAX_VIDEO_BYTES : TIMELAPSE_MAX_POSTER_BYTES;
    let stored;
    try {
      stored = await this.storage.writeStream(objectKey, source as any, { maxBytes });
    } catch (error: any) {
      if (error?.code === 'TIMELAPSE_FILE_TOO_LARGE') {
        throw new ApiV1Exception('TIMELAPSE_ARTIFACT_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '渲染产物超过大小上限。');
      }
      throw error;
    }
    const magic = await this.storage.readPrefix(objectKey, 12);
    const valid = kind === 'video'
      ? magic.length >= 8 && magic.subarray(4, 8).toString('latin1') === 'ftyp'
      : magic.length >= 12 && magic.subarray(0, 4).toString('latin1') === 'RIFF' && magic.subarray(8, 12).toString('latin1') === 'WEBP';
    if (!valid) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw new ApiV1Exception('TIMELAPSE_INVALID_ARTIFACT', HttpStatus.BAD_REQUEST,
        kind === 'video' ? '上传的文件不是有效的 MP4 视频。' : '上传的文件不是有效的 WebP 封面。');
    }
    return { id: publicId, kind, size_bytes: stored.size, sha256: stored.sha256 };
  }

  async applyRenderResult(publicId: string, result: TimelapseRenderResult) {
    const report = await this.findByPublicId(publicId);
    if (['pending_review', 'published'].includes(report.status) && result.status === 'completed') {
      return { id: publicId, status: report.status, idempotent: true };
    }
    if (['failed', 'rejected'].includes(report.status) && result.status === 'failed') {
      return { id: publicId, status: report.status, idempotent: true };
    }
    if (!['queued', 'processing'].includes(report.status)) {
      throw new ApiV1Exception('TIMELAPSE_NOT_RENDERING', HttpStatus.CONFLICT, '该战报当前不在渲染流程中。');
    }
    if (result.status !== 'completed') {
      return this.applyFailure(report, result.failure_code, result.failure_reason);
    }
    const videoKey = timelapseVideoKey(publicId)!;
    const posterKey = timelapsePosterKey(publicId)!;
    const [videoInfo, posterInfo] = await Promise.all([
      this.storage.statObject(videoKey),
      this.storage.statObject(posterKey),
    ]);
    if (!videoInfo.exists || !videoInfo.size || !posterInfo.exists || !posterInfo.size) {
      return this.applyFailure(report, 'WORKER_ARTIFACTS_MISSING', '渲染 Worker 未上传完整的视频或封面。');
    }

    const metrics = sanitizeTimelapseMetrics(result.summary_metrics);
    const highlights = sanitizeTimelapseHighlights(result.highlights, metrics);
    const mapName = this.clampText(result.map_name ?? report.map_name, 160) || '未命名地图';
    // 波次列是 INT UNSIGNED，且 battleReport 的 maxWave 上限为 1,000,000：
    // 点位、Worker highlights 与 result.max_wave 三条来源都必须收敛到同一上限。
    const maxWave = Math.min(1_000_000, Math.max(0, Math.round(Math.max(
      highlights.max_wave,
      Number(result.max_wave) || 0,
    ))));
    highlights.max_wave = maxWave;
    const frameCount = Math.min(180, Math.max(0, Math.round(Number(result.frame_count) || 0)));
    const durationSeconds = Math.min(86_400, Math.max(0, Math.round(Number(result.duration_seconds) || 0)));
    const autoApprove = await this.shouldAutoApprove(report.author_user_id);
    const status: TimelapseStatus = autoApprove ? 'published' : 'pending_review';
    const now = new Date();

    await this.reports.update({ id: report.id }, {
      status,
      video_object_key: videoKey,
      poster_object_key: posterKey,
      map_name: mapName,
      map_width: this.clampInt(result.map_width, 0, 100_000),
      map_height: this.clampInt(result.map_height, 0, 100_000),
      game_mode: this.clampText(result.game_mode, 40),
      game_version: this.clampText(result.game_version, 64),
      is_multiplayer: Boolean(result.is_multiplayer),
      max_wave: maxWave,
      duration_seconds: durationSeconds,
      frame_count: frameCount,
      summary_metrics_json: metrics,
      highlights_json: highlights,
      source_purge_after: new Date(now.getTime() + TIMELAPSE_SOURCE_PURGE_HOURS * 60 * 60 * 1000),
      reviewed_by_user_id: autoApprove ? null : report.reviewed_by_user_id,
      reviewed_at: autoApprove ? now : report.reviewed_at,
      review_reason: autoApprove ? 'auto_approved_trusted' : report.review_reason,
      failure_code: null,
      failure_reason: null,
      updated_at: now,
    });

    if (autoApprove) {
      await this.notifyAuthor(report.author_user_id, `你的基地延时战报《${mapName}》已自动通过审核并发布。`);
    } else {
      await this.notifyAuthor(report.author_user_id, `你的基地延时战报《${mapName}》已生成，正在等待人工审核。`);
      const author = await this.users.findOne({ where: { id: report.author_user_id }, select: { username: true } });
      await this.adminNotifications.publishModerationPending({
        item_type: 'timelapse',
        item_id: Number(report.id),
        title: mapName,
        content: `最高 ${maxWave} 波 · ${frameCount} 帧`,
        author_username: author?.username || `#${report.author_user_id}`,
        action_url: '/admin/content/moderation?type=timelapses',
      }).catch((error) => this.logger.warn(`延时战报待审通知发送失败: ${error?.message || error}`));
    }
    return { id: publicId, status };
  }

  async applyFailure(report: TimelapseReport, code: unknown, reason: unknown) {
    const failureCode = sanitizeFailureCode(code);
    const failureReason = sanitizeFailureReason(reason);
    await Promise.all([
      report.video_object_key ? this.storage.deleteObject(report.video_object_key).catch(() => undefined) : undefined,
      report.poster_object_key ? this.storage.deleteObject(report.poster_object_key).catch(() => undefined) : undefined,
      this.storage.deleteObject(timelapseVideoKey(report.public_id)!).catch(() => undefined),
      this.storage.deleteObject(timelapsePosterKey(report.public_id)!).catch(() => undefined),
    ]);
    await this.reports.update({ id: report.id }, {
      status: 'failed',
      video_object_key: null,
      poster_object_key: null,
      failure_code: failureCode,
      failure_reason: failureReason,
      source_purge_after: new Date(Date.now() + TIMELAPSE_SOURCE_PURGE_HOURS * 60 * 60 * 1000),
      updated_at: new Date(),
    });
    await this.notifyAuthor(report.author_user_id, `你的基地延时战报《${report.map_name || '未命名地图'}》渲染失败：${failureReason}`);
    return { id: report.public_id, status: 'failed', failure_code: failureCode };
  }

  // ---------------------------------------------------------------------------
  // 后台队列
  // ---------------------------------------------------------------------------

  async listForAdmin(query: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
    const qb = this.reports.createQueryBuilder('t')
      .leftJoin(User, 'u', 'u.id = t.author_user_id')
      .select([
        't.public_id AS public_id', 't.status AS status', 't.visibility AS visibility',
        't.map_name AS map_name', 't.max_wave AS max_wave', 't.frame_count AS frame_count',
        't.duration_seconds AS duration_seconds', 't.failure_code AS failure_code',
        't.failure_reason AS failure_reason', 't.created_at AS created_at',
        't.reviewed_at AS reviewed_at', 't.review_reason AS review_reason',
        'u.id AS author_id', 'u.username AS author_username',
      ])
      .where('t.deleted_at IS NULL');
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    const total = await qb.getCount();
    const rows = await qb.orderBy('t.created_at', 'DESC').offset((page - 1) * limit).limit(limit).getRawMany();
    return {
      data: rows.map((row) => ({
        id: row.public_id,
        status: row.status,
        visibility: row.visibility,
        map_name: row.map_name,
        max_wave: Number(row.max_wave || 0),
        frame_count: Number(row.frame_count || 0),
        duration_seconds: Number(row.duration_seconds || 0),
        failure_code: row.failure_code,
        failure_reason: row.failure_reason,
        created_at: row.created_at,
        reviewed_at: row.reviewed_at,
        review_reason: row.review_reason,
        author: { id: Number(row.author_id), username: row.author_username },
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  // ---------------------------------------------------------------------------
  // 内部辅助
  // ---------------------------------------------------------------------------

  async assertEnabled(): Promise<void> {
    const enabled = await this.settings.getBoolean('timelapses_enabled', false);
    if (!enabled) {
      throw new ApiV1Exception('TIMELAPSE_DISABLED', HttpStatus.FORBIDDEN, '基地延时摄影功能当前未开启。');
    }
    if (!this.storage.isConfigured()) {
      throw new ApiV1Exception('TIMELAPSE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '延时摄影存储尚未配置。', true);
    }
  }

  isQueueAvailable(): boolean {
    return this.queue.isAvailable();
  }

  private async shouldAutoApprove(authorUserId: number): Promise<boolean> {
    if (!(await this.settings.getBoolean('timelapse_auto_approve_trusted', false))) return false;
    const user = await this.users.findOne({ where: { id: authorUserId }, select: { id: true, role: true } });
    if (!user) return false;
    if (STAFF_ROLES.has(user.role)) return true;
    const minPoints = Number(await this.settings.get('timelapse_trusted_min_points') || 1000);
    const points = await this.points.getUserPoints(authorUserId).catch(() => null);
    if (!points || Number(points.total_points || 0) < minPoints) return false;
    if (await this.bans.isActive('user', authorUserId)) return false;
    return true;
  }

  private async findByPublicId(publicId: string): Promise<TimelapseReport> {
    if (!isSafePublicId(publicId)) throw this.notFound();
    const report = await this.reports.findOne({ where: { public_id: publicId, deleted_at: IsNull() } });
    if (!report) throw this.notFound();
    return report;
  }

  private async findOwned(publicId: string, userId: number): Promise<TimelapseReport> {
    const report = await this.findByPublicId(publicId);
    if (report.author_user_id !== userId) throw this.notFound();
    return report;
  }

  private assertVisible(report: TimelapseReport, viewer: TimelapseViewer): void {
    if (viewer && viewer.id === report.author_user_id) return;
    if (report.status === 'published' && report.visibility !== 'private') return;
    throw this.notFound();
  }

  private notFound(): ApiV1Exception {
    return new ApiV1Exception('TIMELAPSE_NOT_FOUND', HttpStatus.NOT_FOUND, '基地延时战报不存在或不可见。');
  }

  private serialize(report: TimelapseReport, viewer: TimelapseViewer, author: Pick<User, 'id' | 'username' | 'avatar_url'> | null): TimelapsePublicDto {
    const isAuthor = Boolean(viewer && viewer.id === report.author_user_id);
    const canReview = isAuthor || Boolean(viewer && STAFF_ROLES.has(viewer.role));
    const metrics = sanitizeTimelapseMetrics(report.summary_metrics_json);
    const highlights: TimelapseHighlights = sanitizeTimelapseHighlights(report.highlights_json, metrics);
    const mediaVisible = Boolean(report.video_object_key) && (report.status === 'published' || isAuthor);
    return {
      id: report.public_id,
      status: report.status,
      visibility: report.visibility,
      author: { id: author?.id ?? report.author_user_id, username: author?.username ?? '已注销用户', avatar_url: author?.avatar_url ?? null },
      map_name: report.map_name || '',
      map_width: report.map_width,
      map_height: report.map_height,
      game_mode: report.game_mode,
      game_version: report.game_version,
      is_multiplayer: Boolean(report.is_multiplayer),
      max_wave: report.max_wave || highlights.max_wave,
      duration_seconds: report.duration_seconds,
      frame_count: report.frame_count,
      video_url: mediaVisible ? `/api/v1/timelapses/${report.public_id}/video` : null,
      poster_url: mediaVisible && report.poster_object_key ? `/api/v1/timelapses/${report.public_id}/poster` : null,
      metrics,
      highlights,
      created_at: report.created_at?.toISOString?.() ?? String(report.created_at),
      published_at: report.status === 'published' && report.reviewed_at ? new Date(report.reviewed_at).toISOString() : null,
      review_reason: canReview ? report.review_reason : null,
      failure_code: canReview ? report.failure_code : null,
      failure_reason: canReview ? report.failure_reason : null,
    };
  }

  private clampText(value: unknown, max: number): string | null {
    if (value === undefined || value === null) return null;
    const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return text ? text.slice(0, max) : null;
  }

  private clampInt(value: unknown, min: number, max: number): number | null {
    if (value === undefined || value === null || value === '') return null;
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return null;
    return Math.min(max, Math.max(min, number));
  }

  private async notifyAuthor(userId: number, content: string): Promise<void> {
    await this.notifications.create({ user_id: userId, type: 'timelapse', content, emailEvent: false })
      .catch((error) => this.logger.warn(`延时战报通知发送失败: ${error?.message || error}`));
  }
}
