import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DownloadEvent } from '@entities/download-event.entity';

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
  constructor(@InjectRepository(DownloadEvent) private readonly events: Repository<DownloadEvent>) {}

  async recordEvent(event: DownloadEventInput): Promise<void> {
    await this.events.insert({ ...event, client_version: event.client_version || null, dedup_key: null, dedup_bucket: null });
    this.logger.verbose(`Download event: ${event.event_type} file=${event.file_id ?? 'legacy'}`);
  }

  getAggregateCount(fileId: number): Promise<number> {
    return this.events.count({ where: { file_id: fileId, event_type: 'granted' } });
  }

  getResourceAggregate(resourceId: number): Promise<number> {
    return this.events.count({ where: { resource_id: resourceId, event_type: 'granted' } });
  }
}
