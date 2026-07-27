import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  Report, ReportStatus, ReportTargetType,
} from '@entities/report.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { Resource } from '@entities/resource.entity';
import { User } from '@entities/user.entity';
import { POST_STATUS, REPLY_STATUS, RESOURCE_STATUS } from '@common/utils/constants';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { SettingsService } from '../settings/settings.service';
import { toPublicUser } from '../users/public-user.util';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';

/** Settings key holding the number of open reports that hides content automatically. */
export const REPORT_AUTO_HIDE_THRESHOLD_KEY = 'report_auto_hide_threshold';

/** Used when the setting is absent; `0` in the setting disables auto-hiding entirely. */
export const DEFAULT_REPORT_AUTO_HIDE_THRESHOLD = 5;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminReportView extends Omit<Report, 'reporter' | 'handler'> {
  reporter: Partial<User> | null;
  handler: Partial<User> | null;
}

/**
 * What a reporter is allowed to see about their own submission: the outcome, but not
 * which moderator produced it.
 */
export interface MyReportView {
  id: number;
  target_type: ReportTargetType;
  target_id: number;
  reason: string;
  detail: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  created_at: Date;
  handled_at: Date | null;
}

interface ReportTarget {
  owner_id: number;
  /** Moderation status of the target, or null for target types that have none. */
  status: string | null;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly settingsService: SettingsService,
    private readonly adminNotificationsService: AdminNotificationsService,
  ) {}

  async create(reporterId: number, dto: CreateReportDto): Promise<Report> {
    const target = await this.resolveTarget(dto.target_type, dto.target_id);

    if (target.owner_id === reporterId) {
      throw new BadRequestException('不能举报自己的内容');
    }

    // Checked rather than enforced by a unique constraint, because the rule only
    // covers reports still open — once a moderator has ruled on one, the same user
    // must be able to report a repeat offence.
    const openReport = await this.reportRepository.findOne({
      where: {
        reporter_id: reporterId,
        target_type: dto.target_type,
        target_id: dto.target_id,
        status: 'pending',
      },
    });
    if (openReport) {
      throw new ConflictException('您已举报过该内容，请等待管理员处理');
    }

    const report = this.reportRepository.create({
      reporter_id: reporterId,
      target_type: dto.target_type,
      target_id: dto.target_id,
      reason: dto.reason,
      detail: dto.detail ?? null,
      status: 'pending',
      handled_by: null,
      handled_at: null,
      resolution_note: null,
    });
    const saved = await this.reportRepository.save(report);

    await this.maybeEscalate(dto.target_type, dto.target_id, target.status);

    return saved;
  }

  async listForAdmin(params: {
    status?: ReportStatus;
    target_type?: ReportTargetType;
    page: number;
    limit: number;
  }): Promise<{ data: AdminReportView[]; pagination: Pagination }> {
    const page = Math.max(1, params.page);
    const limit = Math.max(1, params.limit);

    const [reports, total] = await this.reportRepository.findAndCount({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.target_type ? { target_type: params.target_type } : {}),
      },
      relations: ['reporter', 'handler'],
      // Oldest first inside the queue would be fairer but breaks the "what just came
      // in" view the moderation dashboard is built around.
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: reports.map((report) => this.toAdminView(report)),
      pagination: this.buildPagination(page, limit, total),
    };
  }

  async getMyReports(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: MyReportView[]; pagination: Pagination }> {
    const currentPage = Math.max(1, page);
    const perPage = Math.max(1, limit);

    const [reports, total] = await this.reportRepository.findAndCount({
      where: { reporter_id: userId },
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (currentPage - 1) * perPage,
      take: perPage,
    });

    return {
      data: reports.map((report) => ({
        id: report.id,
        target_type: report.target_type,
        target_id: report.target_id,
        reason: report.reason,
        detail: report.detail,
        status: report.status,
        resolution_note: report.resolution_note,
        created_at: report.created_at,
        handled_at: report.handled_at,
      })),
      pagination: this.buildPagination(currentPage, perPage, total),
    };
  }

  async resolve(reportId: number, handlerId: number, dto: ResolveReportDto): Promise<Report> {
    const report = await this.reportRepository.findOne({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException('举报记录不存在');
    }

    // Two moderators opening the queue at once would otherwise overwrite each
    // other's decision, and the second one would never know.
    if (report.status !== 'pending') {
      throw new ConflictException('该举报已被处理');
    }

    report.status = dto.status;
    report.handled_by = handlerId;
    report.handled_at = new Date();
    report.resolution_note = dto.resolution_note ?? null;

    return this.reportRepository.save(report);
  }

  async countPendingForTarget(targetType: ReportTargetType, targetId: number): Promise<number> {
    return this.reportRepository.count({
      where: { target_type: targetType, target_id: targetId, status: 'pending' },
    });
  }

  /**
   * Look up the reported row and who owns it.
   *
   * Soft-deleted content is treated as missing: the row is still there, but it is no
   * longer visible to anyone, so a report against it has nothing to act on.
   */
  private async resolveTarget(
    targetType: ReportTargetType,
    targetId: number,
  ): Promise<ReportTarget> {
    switch (targetType) {
      case 'post': {
        const post = await this.postRepository.findOne({
          where: { id: targetId, deleted_at: IsNull() },
          select: { id: true, user_id: true, status: true },
        });
        if (!post) {
          throw new NotFoundException('举报的帖子不存在');
        }
        return { owner_id: post.user_id, status: post.status };
      }
      case 'reply': {
        const reply = await this.replyRepository.findOne({
          where: { id: targetId, deleted_at: IsNull() },
          select: { id: true, user_id: true, status: true },
        });
        if (!reply) {
          throw new NotFoundException('举报的回复不存在');
        }
        return { owner_id: reply.user_id, status: reply.status };
      }
      case 'resource': {
        const resource = await this.resourceRepository.findOne({
          where: { id: targetId, deleted_at: IsNull() },
          select: { id: true, user_id: true, status: true },
        });
        if (!resource) {
          throw new NotFoundException('举报的资源不存在');
        }
        return { owner_id: resource.user_id, status: resource.status };
      }
      case 'user': {
        const user = await this.userRepository.findOne({
          where: { id: targetId },
          select: { id: true },
        });
        if (!user) {
          throw new NotFoundException('举报的用户不存在');
        }
        // A user is their own owner, which is what makes the self-report check in
        // `create` cover "reporting yourself" too.
        return { owner_id: user.id, status: null };
      }
      default:
        throw new BadRequestException('不支持的举报类型');
    }
  }

  /**
   * Send content back for review once enough people have flagged it.
   *
   * Deliberately best-effort: the report itself is already committed, and failing the
   * request after that would tell the reporter their submission was rejected.
   */
  private async maybeEscalate(
    targetType: ReportTargetType,
    targetId: number,
    targetStatus: string | null,
  ): Promise<void> {
    try {
      const threshold = await this.resolveAutoHideThreshold();
      if (threshold <= 0) {
        return;
      }

      const pendingCount = await this.countPendingForTarget(targetType, targetId);
      if (pendingCount < threshold) {
        return;
      }

      const hidden = await this.hideTarget(targetType, targetId, targetStatus);

      // Users cannot be hidden, and content already awaiting review does not change
      // state — but moderators still need to hear about the report that crossed the
      // threshold. Reporting it only on the exact crossing keeps every further report
      // from re-notifying.
      if (!hidden && pendingCount !== threshold) {
        return;
      }

      await this.adminNotificationsService.publish({
        event_key: `report.threshold.${targetType}`,
        category: 'moderation',
        level: 'warning',
        title: `举报达到阈值: ${targetType} #${targetId}`,
        content: `该内容已收到 ${pendingCount} 条待处理举报${hidden ? '，已自动转入待复审' : ''}。`,
        action_url: '/admin/reports',
        metadata: {
          target_type: targetType,
          target_id: targetId,
          pending_count: pendingCount,
          auto_hidden: hidden,
        },
        preference_key: 'admin_notifications_moderation_pending_enabled',
      });
    } catch (error) {
      this.logger.error(
        `Report escalation failed for ${targetType} #${targetId}: ${(error as Error).message}`,
      );
    }
  }

  /** Whether the target's status actually changed. */
  private async hideTarget(
    targetType: ReportTargetType,
    targetId: number,
    targetStatus: string | null,
  ): Promise<boolean> {
    switch (targetType) {
      case 'post':
        if (targetStatus === POST_STATUS.pending) return false;
        await this.postRepository.update({ id: targetId }, { status: POST_STATUS.pending });
        return true;
      case 'reply':
        if (targetStatus === REPLY_STATUS.pending) return false;
        await this.replyRepository.update({ id: targetId }, { status: REPLY_STATUS.pending });
        return true;
      case 'resource':
        if (targetStatus === RESOURCE_STATUS.pending) return false;
        await this.resourceRepository.update({ id: targetId }, { status: RESOURCE_STATUS.pending });
        return true;
      default:
        return false;
    }
  }

  private async resolveAutoHideThreshold(): Promise<number> {
    const configured = await this.settingsService.getNumber(REPORT_AUTO_HIDE_THRESHOLD_KEY);
    if (configured === null || !Number.isFinite(configured) || configured < 0) {
      return DEFAULT_REPORT_AUTO_HIDE_THRESHOLD;
    }
    return Math.floor(configured);
  }

  private toAdminView(report: Report): AdminReportView {
    const { reporter, handler, ...rest } = report;
    return {
      ...rest,
      reporter: reporter ? toPublicUser(reporter) : null,
      handler: handler ? toPublicUser(handler) : null,
    };
  }

  private buildPagination(page: number, limit: number, total: number): Pagination {
    return {
      page,
      limit,
      total,
      // The web client's normalizer treats a pagination object with any of the four
      // fields missing as "no data at all", so all four are always present.
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
