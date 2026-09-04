import { Injectable, Logger } from '@nestjs/common';

/**
 * Download Events Service — records download lifecycle events.
 *
 * Events: requested, granted, started, completed, failed.
 * Events are used for statistics and admin analytics.
 *
 * This is a placeholder; a later migration will add the download_events table.
 * Currently uses in-memory tracking for the grant/aggregate pattern.
 */

export type DownloadEvent = {
  event_type: 'requested' | 'granted' | 'started' | 'completed' | 'failed';
  resource_id: number;
  version_id: number;
  file_id: number;
  user_id: number | null;
  client_type: string | null;
  platform: string | null;
  backend: string | null;
  created_at: Date;
};

@Injectable()
export class DownloadEventsService {
  private readonly logger = new Logger(DownloadEventsService.name);

  // In-memory event buffer; will be replaced by DB persistence later
  private events: DownloadEvent[] = [];

  recordEvent(event: DownloadEvent): void {
    this.events.push(event);
    this.logger.verbose(`Download event: ${event.event_type} file=${event.file_id}`);
  }

  getAggregateCount(fileId: number): number {
    return this.events.filter(e => e.file_id === fileId && e.event_type === 'granted').length;
  }

  getResourceAggregate(resourceId: number): number {
    return this.events.filter(e => e.resource_id === resourceId && e.event_type === 'granted').length;
  }
}
