import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { DownloadEvent } from '@entities/download-event.entity';
import { isDuplicateKeyError } from '@common/utils/db-error.util';

export type DownloadEventInput = {
  event_type: DownloadEvent['event_type'];
  resource_id: number;
  version_id: number | null;
  file_id: number | null;
  user_id: number | null;
  client_type: string | null;
  client_version?: string | null;
  platform: string | null;
  backend: string | null;
  created_at: Date;
};

@Injectable()
export class DownloadEventsService {
  private readonly logger = new Logger(DownloadEventsService.name);
  /**
   * Bucket width for completion deduplication — a natural-minute bucket (the
   * calendar minute the event falls in), not grant's rolling 60 seconds. Two
   * ends of the same file by the same actor at 10:00:59 and 10:01:01 land in
   * different buckets and both count, so a retry straddling a minute boundary
   * can be counted twice (≈1/60 of boundary cases). Accepted deliberately: a
   * rolling window needs per-(file, actor) timestamps plus a serializing lock,
   * and grant's `download_grant_dedup` row is scoped to grants, not streams.
   * The unique index still makes each append atomic. See
   * docs/production-deployment.md.
   */
  private static readonly DEDUP_BUCKET_MS = 60 * 1000;
  constructor(@InjectRepository(DownloadEvent) private readonly events: Repository<DownloadEvent>) {}

  async recordEvent(event: DownloadEventInput): Promise<void> {
    await this.events.insert({ ...event, client_version: event.client_version || null, dedup_key: null, dedup_bucket: null });
    this.logger.verbose(`Download event: ${event.event_type} file=${event.file_id ?? 'legacy'}`);
  }

  /**
   * Writes the canonical "completed download" for a stream that ended successfully.
   *
   * The dedup key namespaces `completed:` so a completion never collides with
   * the grant row of the same request; the bucket is a natural minute (see
   * `DEDUP_BUCKET_MS`), so a retry straddling a minute boundary counts again.
   * The unique index arbitrates concurrent callbacks, so a rejected replay
   * returns `false` instead of failing the request.
   */
  async recordCompletion(event: DownloadEventInput, actorKey: string): Promise<boolean> {
    const dedupKey = createHash('sha256')
      .update(`completed:${event.file_id ?? `resource:${event.resource_id}`}:${actorKey}`)
      .digest('hex');
    const dedupBucket = String(Math.floor(event.created_at.getTime() / DownloadEventsService.DEDUP_BUCKET_MS));
    try {
      await this.events.insert({ ...event, dedup_key: dedupKey, dedup_bucket: dedupBucket });
      this.logger.verbose(`Download completed: file=${event.file_id ?? 'legacy'} resource=${event.resource_id}`);
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  /** User-visible download count: successful stream ends only, never bare grants. */
  getAggregateCount(fileId: number): Promise<number> {
    return this.events.count({ where: { file_id: fileId, event_type: 'completed' } });
  }

  getResourceAggregate(resourceId: number): Promise<number> {
    return this.events.count({ where: { resource_id: resourceId, event_type: 'completed' } });
  }
}
