import { Injectable, Logger } from '@nestjs/common';

/**
 * Download Grant Service — tracks effective download grants.
 *
 * Public download count = effective, deduplicated grants.
 * This service records grant events and aggregates counts.
 *
 * Historic download_count is preserved as a legacy baseline and never reset.
 * Displayed count = legacy_download_baseline + v1_download_aggregate.
 */

export type GrantRecord = {
  resourceId: number;
  versionId: number;
  fileId: number;
  grantedAt: Date;
  userId: number | null;
  clientType: string | null;
};

@Injectable()
export class DownloadGrantService {
  private readonly logger = new Logger(DownloadGrantService.name);

  // In-memory grant tracking for now; a later phase will persist to download_events table
  private recentGrants: Map<string, Date> = new Map();
  private static readonly DEDUP_WINDOW_MS = 60 * 1000; // 1 minute dedup window

  /**
   * Record a download grant. Returns true if this is a new (non-duplicate) grant.
   */
  recordGrant(record: GrantRecord): boolean {
    const dedupKey = `${record.fileId}:${record.userId || 'anon'}`;
    const now = Date.now();
    const lastGrant = this.recentGrants.get(dedupKey);

    if (lastGrant && (now - lastGrant.getTime()) < DownloadGrantService.DEDUP_WINDOW_MS) {
      return false; // Duplicate within window
    }

    this.recentGrants.set(dedupKey, new Date(now));
    this.logger.verbose(`Download granted: file=${record.fileId} resource=${record.resourceId}`);
    return true;
  }

  /**
   * Compute the displayed download count.
   *
   * displayed = legacy_baseline + v1_aggregate
   */
  computeDisplayedCount(legacyBaseline: number, v1Aggregate: number): number {
    return legacyBaseline + v1Aggregate;
  }
}
