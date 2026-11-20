import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../database/redis.service';
import { signTimelapseJob, signTimelapseRequest } from '../../common/utils/timelapse-signing.util';
import {
  TIMELAPSE_INTERNAL_URL_TTL_SECONDS, TIMELAPSE_JOB_QUEUE, type TimelapseRenderJob,
} from './timelapse.constants';

type JobWithoutSignature = Omit<TimelapseRenderJob, 'signature'>;

/**
 * 渲染任务入队。
 *
 * 队列必须是真实 Redis：RedisService 的内存回退只服务于会话读取，不能承载
 * 跨进程任务。因此这里显式检查 `isRedisAvailable()`，不可用时让 commit 返回
 * 503 并保留 `uploading` 状态，客户端可以稍后重试。
 */
@Injectable()
export class TimelapseQueueService {
  private readonly logger = new Logger(TimelapseQueueService.name);

  constructor(private readonly redis: RedisService, private readonly config: ConfigService) {}

  isAvailable(): boolean {
    return Boolean(this.workerSecret()) && this.redis.isRedisAvailable();
  }

  private workerSecret(): string {
    return String(this.config.get('timelapse.workerSecret') || process.env.TIMELAPSE_WORKER_SECRET || '');
  }

  /** 供 commit 使用：一次构造所有签名 URL 并原子入队。 */
  async enqueue(input: {
    timelapseId: string;
    authorUserId: number;
    sourceSha256: string;
    sourceSizeBytes: number;
  }): Promise<string> {
    const secret = this.workerSecret();
    if (!secret) {
      this.logger.error('TIMELAPSE_WORKER_SECRET 未配置，无法入队渲染任务');
      throw new ServiceUnavailableException({
        code: 'TIMELAPSE_WORKER_NOT_CONFIGURED',
        message: '延时摄影渲染服务尚未配置。',
        retryable: true,
      });
    }
    if (!this.redis.isRedisAvailable()) {
      throw new ServiceUnavailableException({
        code: 'TIMELAPSE_QUEUE_UNAVAILABLE',
        message: '渲染队列暂时不可用，请稍后重试。',
        retryable: true,
      });
    }

    const ttl = Number(this.config.get('timelapse.internalUrlTtlSeconds')) || TIMELAPSE_INTERNAL_URL_TTL_SECONDS;
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttl;
    const expiresAt = new Date(expiresAtSeconds * 1000).toISOString();
    const base = this.internalBaseUrl();
    const jobId = randomUUID();
    const encoded = encodeURIComponent(input.timelapseId);
    const job: JobWithoutSignature = {
      version: 1,
      job_id: jobId,
      timelapse_id: input.timelapseId,
      author_user_id: input.authorUserId,
      source_sha256: input.sourceSha256,
      source_size_bytes: input.sourceSizeBytes,
      source_url: this.signedUrl(secret, base, 'GET', `/api/internal/timelapses/${encoded}/source`, expiresAtSeconds),
      start_url: this.signedUrl(secret, base, 'POST', `/api/internal/timelapses/${encoded}/start`, expiresAtSeconds),
      video_upload_url: this.signedUrl(secret, base, 'PUT', `/api/internal/timelapses/${encoded}/result/video`, expiresAtSeconds),
      poster_upload_url: this.signedUrl(secret, base, 'PUT', `/api/internal/timelapses/${encoded}/result/poster`, expiresAtSeconds),
      result_url: this.signedUrl(secret, base, 'POST', `/api/internal/timelapses/${encoded}/result`, expiresAtSeconds),
      expires_at: expiresAt,
    };
    const signature = signTimelapseJob(secret, job as unknown as Record<string, unknown>);
    const message = JSON.stringify({ ...job, signature });

    try {
      await this.redis.getClient().lpush(TIMELAPSE_JOB_QUEUE, message);
    } catch (error: any) {
      this.logger.warn(`延时摄影任务入队失败: ${error?.message || error}`);
      throw new ServiceUnavailableException({
        code: 'TIMELAPSE_QUEUE_UNAVAILABLE',
        message: '渲染队列暂时不可用，请稍后重试。',
        retryable: true,
      });
    }
    return jobId;
  }

  private internalBaseUrl(): string {
    const configured = String(this.config.get('app.apiUrl') || process.env.API_URL || '').replace(/\/+$/, '');
    if (!configured) return 'http://localhost:4000';
    return configured;
  }

  private signedUrl(secret: string, base: string, method: string, path: string, expiresAt: number): string {
    const signature = signTimelapseRequest(secret, method, path, expiresAt);
    return `${base}${path}?expires=${expiresAt}&signature=${signature}`;
  }
}
