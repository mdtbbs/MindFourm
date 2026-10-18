import { ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue, Worker } from 'bullmq';
import { Repository } from 'typeorm';
import { RedisService } from '../../database/redis.service';
import { ResourceDirectUploadSession } from '../../entities/resource-direct-upload-session.entity';
import { User } from '../../entities/user.entity';
import { ResourceDirectUploadService } from './resource-direct-upload.service';

type CompletionJob = { sessionId: string; objectPublicId: string; userId: number };
type CompletionResult = { file_public_id: string; completed: true; version_public_id?: string };
type JobResult = { result: CompletionResult } | { error: { status: number; response: string | object } };
const QUEUE_NAME = 'resource-upload-completion';

/** Redis retains work across backend restarts; the upload session remains the authority. */
@Injectable()
export class ResourceUploadCompletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceUploadCompletionService.name);
  private queue?: Queue<CompletionJob, JobResult>;
  private worker?: Worker<CompletionJob, JobResult>;

  constructor(
    private readonly redis: RedisService,
    private readonly uploads: ResourceDirectUploadService,
    @InjectRepository(ResourceDirectUploadSession) private readonly sessions: Repository<ResourceDirectUploadSession>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  onModuleInit(): void {
    const connection = this.redis.getConnectionConfig();
    this.queue = new Queue(QUEUE_NAME, {
      connection: { ...connection, maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000, enableOfflineQueue: false },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86400, count: 10000 },
        removeOnFail: { age: 86400, count: 10000 },
      },
    });
    this.worker = new Worker(QUEUE_NAME, (job: Job<CompletionJob>) => this.process(job.data), {
      connection, concurrency: 1,
    });
    this.queue.on('error', () => this.logger.warn('Upload completion queue unavailable'));
    this.worker.on('error', () => this.logger.warn('Upload completion worker unavailable'));
  }

  async onModuleDestroy(): Promise<void> {
    // Interrupted jobs become stalled and are recovered by BullMQ on restart.
    await this.worker?.close(true);
    await this.queue?.close();
  }

  private async ownedSession(sessionId: string, userId: number) {
    const session = await this.sessions.findOne({ where: { id: sessionId, user_id: userId } });
    if (!session) throw new NotFoundException('上传会话不存在');
    return session;
  }

  private completed(session: ResourceDirectUploadSession): CompletionResult | null {
    return session.resource_file_public_id ? { file_public_id: session.resource_file_public_id, completed: true } : null;
  }

  private async queueOperation<T>(operation: (queue: Queue<CompletionJob, JobResult>) => Promise<T>): Promise<T> {
    if (!this.queue) throw new ServiceUnavailableException('上传处理服务暂不可用，请稍后重试');
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      // BullMQ waits indefinitely for its initial Redis connection, even with
      // offline commands disabled. Bound that read-only wait before invoking
      // any mutation, so a rejected HTTP request cannot enqueue work later.
      await Promise.race([
        this.queue.waitUntilReady(),
        new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Queue readiness timeout')), 5000); }),
      ]);
      return await operation(this.queue);
    }
    catch { throw new ServiceUnavailableException('上传处理服务暂不可用，请稍后重试'); }
    finally { if (deadline) clearTimeout(deadline); }
  }

  async enqueue(sessionId: string, objectPublicId: string, userId: number) {
    const session = await this.ownedSession(sessionId, userId);
    const completed = this.completed(session);
    if (completed) return completed;
    sessionId = session.id;
    if (session.expires_at.getTime() <= Date.now()) throw new ConflictException('上传会话已过期');
    if (session.object_public_id && session.object_public_id !== objectPublicId) throw new ConflictException('上传对象不匹配');
    // A session is one job, including across processes, retries and restarts.
    const job = await this.queueOperation(async queue => {
      await queue.add('complete', { sessionId, objectPublicId, userId }, { jobId: sessionId });
      return queue.getJob(sessionId);
    });
    if (!job) throw new ServiceUnavailableException('上传处理任务暂不可用，请重试');
    if (job.data.userId !== userId || job.data.objectPublicId !== objectPublicId) throw new ConflictException('上传对象不匹配');
    return this.readJob(job, sessionId);
  }

  async status(sessionId: string, userId: number) {
    const session = await this.ownedSession(sessionId, userId);
    const completed = this.completed(session);
    if (completed) return completed;
    sessionId = session.id;
    const job = await this.queueOperation(queue => queue.getJob(sessionId));
    if (!job || job.data.userId !== userId) throw new NotFoundException('上传处理任务不存在，请重新提交');
    return this.readJob(job, sessionId);
  }

  private async readJob(job: Job<CompletionJob, JobResult>, sessionId: string) {
    const state = await this.queueOperation(() => job.getState());
    if (state === 'completed' && job.returnvalue) {
      if ('error' in job.returnvalue) throw new HttpException(job.returnvalue.error.response, job.returnvalue.error.status);
      return job.returnvalue.result;
    }
    if (state === 'failed' || state === 'unknown') throw new ServiceUnavailableException('上传处理已中断，请重新提交');
    return { completed: false as const, session_id: sessionId, status: 'processing' as const, poll_after_ms: 3000 };
  }

  async process(input: CompletionJob): Promise<JobResult> {
    try {
      // Do not preserve an administrator role in queue data. Re-read it when work starts.
      const user = await this.users.findOne({ where: { id: input.userId } });
      if (!user) throw new NotFoundException('上传用户不存在');
      const result = await this.uploads.complete(input.sessionId, input.objectPublicId, { id: user.id, role: user.role });
      return { result: result as CompletionResult };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return { error: { status: error.getStatus(), response: error.getResponse() } };
      }
      // Unexpected dependency/internal errors must not leak credentials or stack traces through Redis/status.
      return { error: { status: 503, response: { code: 'RESOURCE_STORAGE_UNAVAILABLE', message: '资源文件校验暂不可用，请稍后重新提交', retryable: true } } };
    }
  }
}
