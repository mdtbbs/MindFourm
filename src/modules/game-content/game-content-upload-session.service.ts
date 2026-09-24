import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { GameContentUploadSession } from '@entities/game-content-upload-session.entity';
import { Resource } from '@entities/resource.entity';
import { ResourceStorageService } from '../resources/resource-storage.service';
import { ResourcePreviewService } from '../resources/resource-preview.service';

const SESSION_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class GameContentUploadSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameContentUploadSessionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(GameContentUploadSession) private readonly sessions: Repository<GameContentUploadSession>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly storage: ResourceStorageService,
    private readonly previews: ResourcePreviewService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.cleanupExpired().catch((error) => this.logger.error(`Upload session cleanup failed: ${(error as Error).message}`)), 60 * 60 * 1000);
    this.timer.unref();
    void this.cleanupExpired().catch((error) => this.logger.error(`Upload session cleanup failed: ${(error as Error).message}`));
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async create(input: Pick<GameContentUploadSession,
    'user_id' | 'filename' | 'mime_type' | 'actual_size' | 'expected_sha256' | 'actual_sha256' | 'storage_key' | 'preview_key' | 'parser_version' | 'renderer_metadata'>): Promise<GameContentUploadSession> {
    const now = new Date();
    const active = await this.sessions.count({ where: { user_id: input.user_id, status: In(['uploaded', 'processing']), expires_at: MoreThan(now) } });
    if (active >= 5) throw new HttpException({ code: 'UPLOAD_LIMIT_REACHED', message: '未完成的地图上传数量已达上限' }, HttpStatus.TOO_MANY_REQUESTS);
    return this.sessions.save(this.sessions.create({
      ...input,
      id: randomUUID(),
      resource_kind: 'map',
      status: 'uploaded',
      resource_id: null,
      completed_at: null,
      expires_at: new Date(now.getTime() + SESSION_TTL_MS),
    }));
  }

  async getOwned(id: string, userId: number): Promise<GameContentUploadSession> {
    const session = await this.sessions.findOne({ where: { id, user_id: userId } });
    if (!session) throw new NotFoundException('上传会话不存在');
    if (session.status !== 'completed' && session.status !== 'expired' && session.expires_at <= new Date()) {
      const linked = await this.findLinkedResourceId(session.id);
      if (linked) {
        await this.setCompleted(session.id, linked);
        session.status = 'completed';
        session.resource_id = linked;
      } else {
        await this.expire(session);
        session.status = 'expired';
      }
    }
    return session;
  }

  async claim(id: string, userId: number): Promise<boolean> {
    const result = await this.sessions.update({ id, user_id: userId, status: 'uploaded', expires_at: MoreThan(new Date()) }, { status: 'processing' });
    return (result.affected || 0) > 0;
  }

  async setUploaded(id: string): Promise<void> {
    await this.sessions.update({ id, status: 'processing' }, { status: 'uploaded' });
  }

  async setCompleted(id: string, resourceId: number): Promise<GameContentUploadSession> {
    await this.sessions.update({ id }, { status: 'completed', resource_id: resourceId, completed_at: new Date() });
    return this.sessions.findOneOrFail({ where: { id } });
  }

  async setFailed(id: string): Promise<void> {
    await this.sessions.update({ id, status: 'processing' }, { status: 'failed' });
  }

  async getPreview(userId: number, id: string): Promise<Buffer> {
    const session = await this.getOwned(id, userId);
    if (session.status === 'expired' || !session.preview_key) throw new NotFoundException('预览已失效');
    return this.previews.readPreviewKey(session.preview_key);
  }

  async cleanupExpired(now = new Date()): Promise<number> {
    const expired = await this.sessions.find({
      where: { expires_at: LessThan(now), status: In(['uploaded', 'processing', 'failed']) },
      take: 200,
      order: { expires_at: 'ASC' },
    });
    let cleaned = 0;
    for (const session of expired) {
      if (session.status === 'completed' || session.status === 'expired') continue;
      const linked = await this.findLinkedResourceId(session.id);
      if (linked) {
        await this.setCompleted(session.id, linked);
        continue;
      }
      const changed = await this.sessions.update({ id: session.id, status: session.status, expires_at: LessThan(now) }, { status: 'expired' });
      if (!(changed.affected || 0)) continue;
      await this.storage.removeManaged(session.storage_key).catch(() => undefined);
      await this.previews.removePreviewKey(session.preview_key);
      cleaned += 1;
    }
    const staleIncoming = await this.storage.cleanupStaleIncomingUploads(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    if (staleIncoming) this.logger.log(`Removed ${staleIncoming} stale incoming upload file(s)`);
    return cleaned;
  }

  private async expire(session: GameContentUploadSession): Promise<void> {
    const changed = await this.sessions.update({ id: session.id, status: session.status }, { status: 'expired' });
    if (changed.affected) {
      await this.storage.removeManaged(session.storage_key).catch(() => undefined);
      await this.previews.removePreviewKey(session.preview_key);
    }
  }

  private async findLinkedResourceId(uploadSessionId: string): Promise<number | null> {
    const resource = await this.resources.createQueryBuilder('resource')
      .select(['resource.id'])
      .withDeleted()
      .where('resource.game_content_upload_session_id = :uploadSessionId', { uploadSessionId })
      .addSelect('resource.game_content_upload_session_id')
      .getOne();
    return resource?.id ?? null;
  }
}
