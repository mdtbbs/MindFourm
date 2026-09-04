import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameVersion } from '@entities/game-version.entity';
import { MindustryVersionValue } from '@common/versioning/mindustry-version-value';
import { MindustryVersionComparator } from '@common/versioning/mindustry-version-comparator';

/**
 * GameVersion Service.
 *
 * Manages Mindustry game version records and uses the MindustryVersionComparator
 * for ordering and range checks.
 */

export type GameVersionDto = {
  id: number;
  public_id: string;
  version_value: string;
  game_series: string;
  release_channel: string;
  display_name: string | null;
  released_at: string | null;
  is_official: boolean;
};

@Injectable()
export class GameVersionService {
  private readonly logger = new Logger(GameVersionService.name);

  constructor(
    @InjectRepository(GameVersion)
    private readonly gameVersionRepo: Repository<GameVersion>,
  ) {}

  async listVersions(series?: string): Promise<GameVersionDto[]> {
    const where: any = {};
    if (series) where.game_series = series;

    const versions = await this.gameVersionRepo.find({
      where,
      order: { released_at: 'DESC' },
    });

    return versions.map(this.toDto);
  }

  async getLatestStable(): Promise<GameVersionDto | null> {
    const versions = await this.gameVersionRepo.find({
      where: { game_series: 'stable', is_official: true },
      order: { released_at: 'DESC' },
    });

    if (versions.length === 0) return null;

    // Use comparator to find the actual newest by version_value
    const parsed = versions
      .map(v => ({ entity: v, parsed: MindustryVersionValue.parse(v.version_value) }))
      .filter(v => v.parsed !== null);

    const newest = MindustryVersionComparator.newest(parsed.map(v => v.parsed!));
    if (!newest) return this.toDto(versions[0]);

    const match = parsed.find(v => v.parsed!.equals(newest));
    return match ? this.toDto(match.entity) : this.toDto(versions[0]);
  }

  async findCompatibleVersions(minVersion: string | null, maxVersion: string | null): Promise<GameVersionDto[]> {
    const allVersions = await this.gameVersionRepo.find({ order: { released_at: 'DESC' } });
    const minParsed = minVersion ? MindustryVersionValue.parse(minVersion) : null;
    const maxParsed = maxVersion ? MindustryVersionValue.parse(maxVersion) : null;

    return allVersions
      .filter(v => {
        const parsed = MindustryVersionValue.parse(v.version_value);
        if (!parsed) return false;
        return MindustryVersionComparator.inRange(parsed, minParsed, maxParsed);
      })
      .map(v => this.toDto(v));
  }

  private toDto(entity: GameVersion): GameVersionDto {
    return {
      id: entity.id,
      public_id: entity.public_id,
      version_value: entity.version_value,
      game_series: entity.game_series,
      release_channel: entity.release_channel,
      display_name: entity.display_name || null,
      released_at: entity.released_at?.toISOString() || null,
      is_official: entity.is_official,
    };
  }
}
