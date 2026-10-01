import { QueryRunner } from 'typeorm';
import { MultiplayerPlatformV11720000150000 } from './1720000150000-MultiplayerPlatformV1';

describe('MultiplayerPlatformV1 friendship key migration', () => {
  it('adds MySQL 5.7 virtual columns and their unique index in separate ALTER statements', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new MultiplayerPlatformV11720000150000();

    await migration.up({ query } as unknown as QueryRunner);

    const friendshipAlters = query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => /ALTER TABLE friendships/i.test(sql));

    expect(friendshipAlters).toHaveLength(3);
    expect(friendshipAlters[0]).toMatch(/ADD COLUMN pair_low .* VIRTUAL/i);
    expect(friendshipAlters[1]).toMatch(/ADD COLUMN pair_high .* VIRTUAL/i);
    expect(friendshipAlters[2]).toMatch(/ADD UNIQUE INDEX uq_friendships_undirected_pair/i);
    expect(friendshipAlters.join('\n')).not.toMatch(/ STORED/i);
  });
});
