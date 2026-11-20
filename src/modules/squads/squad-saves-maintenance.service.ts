import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SquadSaveStorageService } from './squad-save-storage.service';

/** 与个人云存档维护同频：清理过期暂存对象并回收引用归零的小队 blob。 */
@Injectable()
export class SquadSavesMaintenanceService {
  private readonly logger = new Logger(SquadSavesMaintenanceService.name);
  private running = false;

  constructor(private readonly storage: SquadSaveStorageService) {}

  @Interval(15 * 60 * 1000)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.storage.runMaintenance();
      if (Object.values(result).some((value) => value > 0)) {
        this.logger.log(`Squad save maintenance completed: ${JSON.stringify(result)}`);
      }
    } catch {
      this.logger.warn('Squad save maintenance failed; the next scheduled pass will retry.');
    } finally {
      this.running = false;
    }
  }
}
