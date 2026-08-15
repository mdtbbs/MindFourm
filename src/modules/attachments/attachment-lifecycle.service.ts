import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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

  async scheduledCleanup(): Promise<void> {
    try {
      const removed = await this.cleanup();
      if (removed) await this.logs.log({ action: 'attachment.storage_cleanup', target_type: 'attachment_storage', details: JSON.stringify({ removed }) });
    } catch (error) {
      this.logger.error(`Attachment storage cleanup failed: ${(error as Error).message}`);
    }
  }
}
