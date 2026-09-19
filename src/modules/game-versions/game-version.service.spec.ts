jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class { warn = jest.fn(); },
}));
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => undefined }));
jest.mock('@entities/game-version.entity', () => ({ GameVersion: class GameVersion {} }));

import { GameVersionService } from './game-version.service';

describe('GameVersionService', () => {
  it('lists versions ordered by released_at DESC', async () => {
    const versions = [
      { id: 1, public_id: 'a', version_value: '159', game_series: 'stable', release_channel: 'stable', display_name: 'v159', released_at: new Date('2026-01-01'), is_official: true },
      { id: 2, public_id: 'b', version_value: '160', game_series: 'stable', release_channel: 'stable', display_name: 'v160', released_at: new Date('2026-06-01'), is_official: true },
    ];
    const repo = { find: jest.fn().mockResolvedValue(versions) };
    const service = new GameVersionService(repo as any);

    const result = await service.listVersions();
    expect(result).toHaveLength(2);
    expect(result[0].version_value).toBe('159'); // ordered by released_at DESC
  });

  it('finds compatible versions in a range', async () => {
    const versions = [
      { id: 1, public_id: 'a', version_value: '158', game_series: 'stable', release_channel: 'stable', released_at: new Date(), is_official: true },
      { id: 2, public_id: 'b', version_value: '159', game_series: 'stable', release_channel: 'stable', released_at: new Date(), is_official: true },
      { id: 3, public_id: 'c', version_value: '160', game_series: 'stable', release_channel: 'stable', released_at: new Date(), is_official: true },
    ];
    const repo = { find: jest.fn().mockResolvedValue(versions) };
    const service = new GameVersionService(repo as any);

    const result = await service.findCompatibleVersions('159', '160');
    expect(result).toHaveLength(2);
    expect(result.map(v => v.version_value)).toContain('159');
    expect(result.map(v => v.version_value)).toContain('160');
    expect(result.map(v => v.version_value)).not.toContain('158');
  });

  it('returns null when no stable versions exist', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]) };
    const service = new GameVersionService(repo as any);

    const result = await service.getLatestStable();
    expect(result).toBeNull();
  });

  it('uses the explicitly marked latest stable version rather than comparing release strings', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([{
        id: 9, public_id: 'latest', version_value: '160', build: '160', channel: 'stable',
        game_series: 'stable', release_channel: 'stable', display_name: 'v160',
        released_at: new Date('2026-06-01'), is_official: true, is_stable: true, is_latest: true,
      }]),
    };
    const service = new GameVersionService(repo as any);

    await expect(service.getLatestStable()).resolves.toMatchObject({ build: '160', channel: 'stable', is_latest: true });
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { is_latest: true, is_stable: true, is_official: true },
    }));
  });
});
