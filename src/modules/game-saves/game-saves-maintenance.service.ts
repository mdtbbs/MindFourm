import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { GameSavesService } from './game-saves.service';

@Injectable()
export class GameSavesMaintenanceService {
  private readonly logger = new Logger(GameSavesMaintenanceService.name);
  private running = false;
  constructor(private readonly saves: GameSavesService) {}

  @Interval(15 * 60 * 1000)
  async sweep(): Promise<void> {
    if (this.running || !this.saves.isStorageReady()) return;
    this.running = true;
    try {
      const result = await this.saves.runMaintenance();
      if (Object.values(result).some(value => value > 0)) this.logger.log(`Cloud save maintenance completed: ${JSON.stringify(result)}`);
    } catch {
      this.logger.warn('Cloud save maintenance failed; the next scheduled pass will retry.');
    } finally { this.running = false; }
  }
}
