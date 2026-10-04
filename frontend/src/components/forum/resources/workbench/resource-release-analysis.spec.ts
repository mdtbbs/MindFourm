import { getRendererReleaseFacts } from './resource-release-analysis';

describe('getRendererReleaseFacts', () => {
  it('shows only allowlisted scalar metadata and dimensions returned by the parser', () => {
    expect(getRendererReleaseFacts({
      name: 'Foundry',
      author: 'Builder',
      width: 96,
      height: 64,
      build: 146,
      game_modes: ['attack', 'survival'],
      storage_key: 'private/path',
      block_positions: [{ x: 2, y: 3 }],
      arbitrary_parser_payload: 'not rendered',
    })).toEqual([
      { key: 'dimensions', value: '96 × 64' },
      { key: 'name', value: 'Foundry' },
      { key: 'author', value: 'Builder' },
      { key: 'build', value: '146' },
      { key: 'game_modes', value: 'attack, survival' },
    ]);
  });

  it('does not invent facts when metadata is absent or malformed', () => {
    expect(getRendererReleaseFacts(null)).toEqual([]);
    expect(getRendererReleaseFacts({ width: 10, height: Number.NaN, spawns: {}, game_modes: ['attack', {}] })).toEqual([]);
  });
});
