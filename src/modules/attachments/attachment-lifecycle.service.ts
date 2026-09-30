import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { rm } from 'fs/promises';
import * as path from 'path';
import { Attachment } from '@entities/attachment.entity';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';

/** Removes only attachments that were already explicitly retired to quarantine. */
@Injectable()
export class AttachmentLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentLifecycleService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.scheduledCleanup(), 24 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async cleanup(now = new Date()): Promise<number> {
    const configured = await this.settings.getNumber('attachment_file_retention_days');
    const days = Math.max(1, Math.min(3650, configured || 30));
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const candidates = await this.attachments.find({ where: { deleted_at: LessThan(cutoff) } });
    const quarantineRoot = path.resolve('./uploads/.quarantine/attachments');
    let removed = 0;
    for (const attachment of candidates) {
      const target = path.resolve(attachment.file_path);
      if (!target.startsWith(`${quarantineRoot}${path.sep}`)) {
        this.logger.warn(`Skipping attachment ${attachment.id}: path is outside quarantine`);
        continue;
      }
      await rm(target, { force: true });
      await this.attachments.remove(attachment);
      removed += 1;
    }
    return removed;
  }

  async cleanupExpiredDrafts(now = new Date()): Promise<number> {
    const quarantineRoot = path.resolve('./uploads/.quarantine/attachments');
    let removed = 0;
    // Drain bounded batches so a large pile of abandoned editor uploads never
    // causes the lifecycle worker to load the entire attachment table.
    for (;;) {
      const batch = await this.attachments.find({
        where: { status: 'draft', draft_expires_at: LessThan(now), deleted_at: IsNull() },
        order: { id: 'ASC' },
        take: 100,
      });
      if (!batch.length) break;
      let removedInBatch = 0;
      for (const attachment of batch) {
        const target = path.resolve(attachment.file_path);
        if (!target.startsWith(`${quarantineRoot}${path.sep}`)) {
          this.logger.warn(`Skipping expired draft ${attachment.id}: path is outside quarantine`);
          continue;
        }
        await rm(target, { force: true });
        await this.attachments.delete({ id: attachment.id, status: 'draft', draft_expires_at: LessThan(now) });
        removed += 1;
        removedInBatch += 1;
      }
      // Avoid an infinite loop if corrupted rows repeatedly fail the path check.
      if (removedInBatch !== batch.length) break;
    }
    return removed;
  }

  async scheduledCleanup(): Promise<void> {
    try {
      const removed = await this.cleanup();
      const expiredDrafts = await this.cleanupExpiredDrafts();
      if (removed || expiredDrafts) await this.logs.log({ action: 'attachment.storage_cleanup', target_type: 'attachment_storage', details: JSON.stringify({ removed, expiredDrafts }) });
    } catch (error) {
      this.logger.error(`Attachment storage cleanup failed: ${(error as Error).message}`);
    }
  }
}
