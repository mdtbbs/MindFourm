import { MemoryStore } from './memory-store';

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  afterEach(() => {
    store.stop();
  });

  describe('strings', () => {
    it('round-trips a value', () => {
      store.set('k', 'v');
      expect(store.get('k')).toBe('v');
    });

    it('returns null for a missing key', () => {
      expect(store.get('nope')).toBeNull();
    });

    it('expires a value once its TTL has passed', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-27T00:00:00Z'));
      try {
        store.set('k', 'v', 60);
        expect(store.get('k')).toBe('v');

        jest.setSystemTime(new Date('2026-07-27T00:00:59Z'));
        expect(store.get('k')).toBe('v');

        jest.setSystemTime(new Date('2026-07-27T00:01:01Z'));
        expect(store.get('k')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('reports TTL using Redis conventions', () => {
      expect(store.ttl('missing')).toBe(-2);

      store.set('forever', 'v');
      expect(store.ttl('forever')).toBe(-1);

      store.set('temporary', 'v', 30);
      expect(store.ttl('temporary')).toBeGreaterThan(0);
    });

    it('increments, preserving any existing expiry', () => {
      expect(store.incr('counter')).toBe(1);
      expect(store.incr('counter')).toBe(2);

      store.set('withTtl', '5', 60);
      store.incr('withTtl');
      expect(store.ttl('withTtl')).toBeGreaterThan(0);
    });

    it('deletes and reports existence', () => {
      store.set('k', 'v');
      expect(store.exists('k')).toBe(1);
      expect(store.del('k')).toBe(1);
      expect(store.exists('k')).toBe(0);
      expect(store.del('k')).toBe(0);
    });
  });

  describe('hashes', () => {
    it('sets and reads fields', () => {
      // This is the shape session data uses.
      expect(store.hset('session:abc', 'userId', '42')).toBe(1);
      expect(store.hset('session:abc', 'userId', '43')).toBe(0);
      expect(store.hget('session:abc', 'userId')).toBe('43');
      expect(store.hgetall('session:abc')).toEqual({ userId: '43' });
    });

    it('returns an empty object for a missing hash', () => {
      expect(store.hgetall('nope')).toEqual({});
      expect(store.hget('nope', 'field')).toBeNull();
    });

    it('deletes fields', () => {
      store.hset('h', 'a', '1');
      store.hset('h', 'b', '2');
      expect(store.hdel('h', 'a', 'missing')).toBe(1);
      expect(store.hgetall('h')).toEqual({ b: '2' });
    });

    it('honours an expiry applied after creation', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-27T00:00:00Z'));
      try {
        store.hset('session:abc', 'userId', '42');
        store.expire('session:abc', 60);

        jest.setSystemTime(new Date('2026-07-27T00:01:01Z'));
        expect(store.hgetall('session:abc')).toEqual({});
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('key patterns', () => {
    it('matches Redis glob patterns rather than substrings', () => {
      store.set('session:a', '1');
      store.set('session:b', '1');
      store.set('other:c', '1');

      expect(store.keys('session:*').sort()).toEqual(['session:a', 'session:b']);
      expect(store.keys('*')).toHaveLength(3);
      expect(store.keys('session:?')).toHaveLength(2);
      // A bare prefix is not a prefix match in Redis.
      expect(store.keys('session:')).toEqual([]);
    });

    it('treats regex metacharacters in the pattern literally', () => {
      store.set('a.b', '1');
      store.set('axb', '1');

      expect(store.keys('a.b')).toEqual(['a.b']);
    });

    it('omits expired keys', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-27T00:00:00Z'));
      try {
        store.set('session:a', '1', 60);
        jest.setSystemTime(new Date('2026-07-27T00:01:01Z'));
        expect(store.keys('session:*')).toEqual([]);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('sorted sets', () => {
    it('ranks members by score, highest first', () => {
      store.zIncrBy('popular', 1, 'rust');
      store.zIncrBy('popular', 3, 'mindustry');
      store.zIncrBy('popular', 2, 'mods');

      expect(store.zRevRange('popular', 0, -1)).toEqual(['mindustry', 'mods', 'rust']);
      expect(store.zRevRange('popular', 0, 1)).toEqual(['mindustry', 'mods']);
    });

    it('accumulates repeated increments', () => {
      store.zIncrBy('popular', 1, 'mods');
      expect(store.zIncrBy('popular', 1, 'mods')).toBe(2);
    });

    it('returns an empty list for a missing set', () => {
      expect(store.zRevRange('nope', 0, -1)).toEqual([]);
    });
  });

  it('clears everything on demand', () => {
    store.set('a', '1');
    store.hset('h', 'f', 'v');
    store.clear();

    expect(store.size).toBe(0);
    expect(store.get('a')).toBeNull();
  });
});
