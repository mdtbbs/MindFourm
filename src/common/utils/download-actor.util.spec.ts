import { downloadActorKey } from './download-actor.util';

describe('downloadActorKey', () => {
  it('identifies a signed-in account the same way on every entry point', () => {
    expect(downloadActorKey(42, '198.51.100.7', 'Launcher/1.0')).toBe('user:42');
    expect(downloadActorKey('42', '198.51.100.7', 'Launcher/1.0')).toBe('user:42');
    expect(downloadActorKey(42, null, null)).toBe('user:42');
  });

  it('derives one key for the same anonymous visitor regardless of how the agent was read', () => {
    const longUserAgent = `Mozilla/${'x'.repeat(120)}`;
    // The web route reads the header whole while the game-content route already
    // cut it to 80 characters; both must produce the same key.
    expect(downloadActorKey(null, '198.51.100.7', longUserAgent))
      .toBe(downloadActorKey(null, '198.51.100.7', longUserAgent.slice(0, 80)));
    expect(downloadActorKey(null, '198.51.100.7', longUserAgent))
      .toBe(`ipua:198.51.100.7:${longUserAgent.slice(0, 80)}`);
  });

  it('separates distinct anonymous visitors by address and agent', () => {
    expect(downloadActorKey(null, '198.51.100.7', 'A'))
      .not.toBe(downloadActorKey(null, '198.51.100.8', 'A'));
    expect(downloadActorKey(null, '198.51.100.7', 'A'))
      .not.toBe(downloadActorKey(null, '198.51.100.7', 'B'));
  });

  it('falls back to the anonymous key when the user id is missing or unusable', () => {
    expect(downloadActorKey(0, '198.51.100.7', 'A')).toBe('ipua:198.51.100.7:A');
    expect(downloadActorKey(Number.NaN, '198.51.100.7', null)).toBe('ipua:198.51.100.7:');
    expect(downloadActorKey(undefined, undefined, undefined)).toBe('ipua:unknown:');
  });
});
