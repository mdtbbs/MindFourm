import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlobsService } from './blobs.service';

/**
 * Periodic reclamation for the Generic Blob API.
 *
 * Object storage cannot be cleaned by a cascade: deleting a binding has to leave
 * the bytes alone while another binding (or an in-flight revival) may still need
 * them. This pass is where unreferenced objects, expired uploads and expired
 * idempotency rows actually go away.
 */
@Injectable()
export class BlobsMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(BlobsMaintenanceService.name);
  private running = false;

  constructor(private readonly blobs: BlobsService) {}

  onModuleInit(): void {
    if (!this.blobs.isEnabled()) return;
    void this.runSafely('startup');
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'blobs-maintenance' })
  async scheduled(): Promise<void> {
    if (!this.blobs.isEnabled()) return;
    await this.runSafely('scheduled');
  }

  private async runSafely(trigger: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.blobs.runMaintenance();
    } catch (error) {
      // A failed sweep must not take the scheduler down; the next tick retries.
      this.logger.warn(`Blob maintenance (${trigger}) failed: ${(error as Error)?.message || error}`);
    } finally {
      this.running = false;
    }
  }
}
