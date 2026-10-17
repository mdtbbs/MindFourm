import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MemoryStore } from './memory-store';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  /**
   * Engaged while Redis is unreachable.
   *
   * `AuthService.verifySession` reads Redis on every authenticated request and is
   * the only authentication path, so an outage previously took the entire site down.
   * Degrading to process memory keeps it usable. See MemoryStore for what that does
   * and does not preserve — notably, sessions written before the outage are not in
   * it, so those users are still signed out.
   */
  private readonly fallback = new MemoryStore();
  private redisAvailable = false;

  /**
   * Per-process cooldown markers, keyed by caller-supplied scope.
   *
   * `setIfNotExists` is not enough for refresh cooldowns: during a Redis outage it
   * would live only in the fallback store and vanish on the next Redis recovery,
   * letting every authenticated request call MindAuth again. This map survives that
   * transition and is pruned lazily, so a Redis hiccup cannot turn read traffic into
   * a MindAuth + MySQL write storm.
   */
  private readonly localCooldowns = new Map<string, number>();

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 50, 2000),
      // Fail the command instead of queueing it forever while disconnected —
      // queued commands would hang request handlers rather than fall back.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    this.fallback.start();

    this.client.on('ready', () => {
      if (!this.redisAvailable) {
        this.logger.log('Redis connected; leaving in-memory fallback');
      }
      this.redisAvailable = true;
      // Not merged back into Redis: the fallback holds only what happened during the
      // outage, and replaying it could resurrect entries Redis has since expired.
      this.fallback.clear();
    });

    const markUnavailable = (reason: string) => {
      if (this.redisAvailable) {
        this.logger.warn(`Redis unavailable (${reason}); serving from in-memory fallback`);
      }
      this.redisAvailable = false;
    };

    this.client.on('error', (err) => markUnavailable(err.message));
    this.client.on('end', () => markUnavailable('connection closed'));
    this.client.on('close', () => markUnavailable('connection closed'));
  }

  async onModuleDestroy() {
    this.fallback.stop();
    if (this.client) await this.client.quit().catch(() => undefined);
  }

  /** Whether commands are currently reaching Redis rather than the fallback. */
  isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  /**
   * Run a Redis command, degrading to the in-memory equivalent on failure.
   *
   * Both the "known offline" and "failed mid-flight" paths route to the same
   * fallback, so a connection dropping between the check and the command still
   * degrades rather than throwing.
   */
  private async withFallback<T>(
    operation: () => Promise<T>,
    fallbackOperation: () => T,
  ): Promise<T> {
    if (!this.redisAvailable) {
      return fallbackOperation();
    }

    try {
      return await operation();
    } catch (error) {
      this.logger.warn(`Redis command failed, using fallback: ${(error as Error).message}`);
      this.redisAvailable = false;
      return fallbackOperation();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Get Redis connection configuration for external libraries (e.g., BullMQ)
   * that may have incompatible ioredis versions
   */
  getConnectionConfig() {
    return {
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db'),
    };
  }

  // ── Cooldowns (Redis-backed with a process-local floor) ──────────────────

  /**
   * Claim a cooldown. Returns true when the caller may proceed, false while the
   * cooldown is still active. The decision is enforced against both Redis and a
   * process-local marker, and a Redis write failure must not open the gate.
   */
  async acquireCooldown(scope: string, ttlSeconds: number, distinctId?: string): Promise<boolean> {
    const key = `cooldown:${scope}:${distinctId ?? 'global'}`;
    const now = Date.now();
    const localExpiry = this.localCooldowns.get(key);
    if (localExpiry !== undefined) {
      if (localExpiry > now) return false;
      this.localCooldowns.delete(key);
    }

    let claimed = false;
    if (this.redisAvailable) {
      try {
        claimed = Boolean(await this.client.set(key, '1', 'EX', ttlSeconds, 'NX'));
      } catch (error) {
        // Keep the local marker: Redis being unreachable must not disable the gate.
        this.logger.warn(`Cooldown store failed, enforcing locally: ${(error as Error).message}`);
        this.redisAvailable = false;
        claimed = true;
      }
    } else {
      claimed = true;
    }

    if (claimed) this.localCooldowns.set(key, now + ttlSeconds * 1000);
    this.pruneLocalCooldowns(now);
    return claimed;
  }

  /** Drop a claimed cooldown so the caller can retry immediately (for example after a retryable error). */
  async releaseCooldown(scope: string, distinctId?: string): Promise<void> {
    const key = `cooldown:${scope}:${distinctId ?? 'global'}`;
    this.localCooldowns.delete(key);
    if (!this.redisAvailable) return;
    try {
      await this.client.del(key);
    } catch {
      // Local release already happened; Redis will expire the key on its own.
    }
  }

  private pruneLocalCooldowns(now = Date.now()): void {
    // Bounded by the number of distinct cooldown scopes/identities in one TTL, so a
    // plain sweep on write is enough and no timer is needed.
    if (this.localCooldowns.size < 512) return;
    for (const [key, expiry] of this.localCooldowns) {
      if (expiry <= now) this.localCooldowns.delete(key);
    }
  }

  // String operations
  async get(key: string): Promise<string | null> {
    return this.withFallback(
      () => this.client.get(key),
      () => this.fallback.get(key),
    );
  }

  async set(key: string, value: string, ttl?: number): Promise<'OK' | null> {
    return this.withFallback(
      () => (ttl ? this.client.set(key, value, 'EX', ttl) : this.client.set(key, value)),
      () => {
        this.fallback.set(key, value, ttl);
        return 'OK' as const;
      },
    );
  }

  /** Atomic SET NX EX for short-lived deduplication keys. */
  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.withFallback(
      () => this.client.set(key, value, 'EX', ttlSeconds, 'NX'),
      () => this.fallback.setIfAbsent(key, value, ttlSeconds) ? 'OK' : null,
    );
    return result === 'OK';
  }

  async del(key: string): Promise<number> {
    return this.withFallback(
      () => this.client.del(key),
      () => this.fallback.del(key),
    );
  }

  /** Atomically consume a short-lived single-use value. */
  async getAndDelete(key: string): Promise<string | null> {
    return this.withFallback(
      async () => this.client.eval(
        "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
        1,
        key,
      ) as Promise<string | null>,
      () => {
        const value = this.fallback.get(key);
        if (value !== null) this.fallback.del(key);
        return value;
      },
    );
  }

  /** Atomic counter with a first-write expiry for bounded abuse signals. */
  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.withFallback(
      () => this.client.eval(
        "local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return value",
        1,
        key,
        ttlSeconds,
      ),
      () => {
        const count = this.fallback.incr(key);
        if (count === 1) this.fallback.expire(key, ttlSeconds);
        return count;
      },
    );
    return Number(value);
  }

  async exists(key: string): Promise<number> {
    return this.withFallback(
      () => this.client.exists(key),
      () => this.fallback.exists(key),
    );
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.withFallback(
      () => this.client.expire(key, seconds),
      () => this.fallback.expire(key, seconds),
    );
  }

  async ttl(key: string): Promise<number> {
    return this.withFallback(
      () => this.client.ttl(key),
      () => this.fallback.ttl(key),
    );
  }

  async incr(key: string): Promise<number> {
    return this.withFallback(
      () => this.client.incr(key),
      () => this.fallback.incr(key),
    );
  }

  /**
   * KEYS is O(N) and blocks the Redis event loop for the whole scan. Prefer
   * {@link countKeys} or {@link scanKeys} on any request-serving path.
   */
  async keys(pattern: string): Promise<string[]> {
    return this.withFallback(
      () => this.client.keys(pattern),
      () => this.fallback.keys(pattern),
    );
  }

  /**
   * Non-blocking equivalent of KEYS, walking the keyspace in cursor-sized chunks.
   */
  async scanKeys(pattern: string, batchSize = 500): Promise<string[]> {
    return this.withFallback(
      async () => {
        const found: string[] = [];
        let cursor = '0';

        do {
          const [nextCursor, batch] = await this.client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            batchSize,
          );
          cursor = nextCursor;
          found.push(...batch);
        } while (cursor !== '0');

        return found;
      },
      () => this.fallback.keys(pattern),
    );
  }

  /**
   * Count matching keys without materialising the whole list.
   */
  async countKeys(pattern: string, batchSize = 500): Promise<number> {
    return this.withFallback(
      async () => {
        let count = 0;
        let cursor = '0';

        do {
          const [nextCursor, batch] = await this.client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            batchSize,
          );
          cursor = nextCursor;
          count += batch.length;
        } while (cursor !== '0');

        return count;
      },
      () => this.fallback.keys(pattern).length,
    );
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    return this.withFallback(
      () => this.client.hget(key, field),
      () => this.fallback.hget(key, field),
    );
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.withFallback(
      () => this.client.hset(key, field, value),
      () => this.fallback.hset(key, field, value),
    );
  }

  async hIncrBy(key: string, field: string, increment = 1): Promise<number> {
    return this.withFallback(
      () => this.client.hincrby(key, field, increment),
      () => {
        const current = Number(this.fallback.hget(key, field) || '0');
        const value = current + increment;
        this.fallback.hset(key, field, String(value));
        return value;
      },
    );
  }

  /** Update timing counters and maxima in one atomic round trip. */
  async aggregateHash(key: string, increments: Array<[string, number]>, maxima: Array<[string, number]>, ttlSeconds: number): Promise<void> {
    await this.withFallback(
      async () => { await this.client.eval(`
        local increments = cjson.decode(ARGV[1])
        local maxima = cjson.decode(ARGV[2])
        for _, item in ipairs(increments) do redis.call('HINCRBY', KEYS[1], item[1], item[2]) end
        for _, item in ipairs(maxima) do
          if item[2] > tonumber(redis.call('HGET', KEYS[1], item[1]) or '0') then redis.call('HSET', KEYS[1], item[1], item[2]) end
        end
        redis.call('EXPIRE', KEYS[1], ARGV[3])
        return 1
      `, 1, key, JSON.stringify(increments), JSON.stringify(maxima), ttlSeconds); },
      () => {
        for (const [field, increment] of increments) this.fallback.hset(key, field, String(Number(this.fallback.hget(key, field) || 0) + increment));
        for (const [field, value] of maxima) if (value > Number(this.fallback.hget(key, field) || 0)) this.fallback.hset(key, field, String(value));
        this.fallback.expire(key, ttlSeconds);
      },
    );
  }

  /** Read revocable session state every time; renew at most once per minute. */
  async readSessionAndRenew(key: string, ttlSeconds: number): Promise<Record<string, string>> {
    return this.withFallback(
      async () => {
        const fields = await this.client.eval(`
          local fields = redis.call('HGETALL', KEYS[1])
          if redis.call('HEXISTS', KEYS[1], 'userId') == 1 and redis.call('TTL', KEYS[1]) < tonumber(ARGV[1]) - 60 then
            redis.call('EXPIRE', KEYS[1], ARGV[1])
          end
          return fields
        `, 1, key, ttlSeconds) as string[];
        const hash: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) hash[fields[i]] = fields[i + 1];
        return hash;
      },
      () => {
        const hash = this.fallback.hgetall(key);
        if (hash.userId && this.fallback.ttl(key) < ttlSeconds - 60) this.fallback.expire(key, ttlSeconds);
        return hash;
      },
    );
  }

  /** Bounded rolling distinct-user activity; no tokens or IP addresses are retained. */
  async recordUserActivity(userId: number, now = Date.now()): Promise<void> {
    const key = 'stats:active-users';
    await this.withFallback(
      async () => { await this.client.eval(`
        local previous = tonumber(redis.call('ZSCORE', KEYS[1], ARGV[1]) or '0')
        if tonumber(ARGV[2]) - previous >= 60000 then
          redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
          redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[2]) - 86400000)
          redis.call('EXPIRE', KEYS[1], 90000)
          redis.call('SET', KEYS[2], ARGV[2], 'NX')
          redis.call('EXPIRE', KEYS[2], 90000)
        end
        return 1
      `, 2, key, 'stats:active-users:observed-since', String(userId), now); },
      () => {
        // Individual expiring keys keep the fallback bounded without a sorted-set scan.
        this.fallback.set(`stats:active-user:${userId}`, String(now), 24 * 60 * 60);
        this.fallback.setIfAbsent('stats:activity-observed-since', String(now), 90000);
        this.fallback.expire('stats:activity-observed-since', 90000);
      },
    );
  }

  async activeUserStats(now = Date.now()): Promise<{ count: number; observedSince: string; complete: boolean }> {
    const [count, started] = await this.withFallback(
      async () => await this.client.eval(`
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - 86400000)
        return { redis.call('ZCARD', KEYS[1]), redis.call('GET', KEYS[2]) or ARGV[1] }
      `, 2, 'stats:active-users', 'stats:active-users:observed-since', now) as [number, string],
      () => [this.fallback.keys('stats:active-user:*').length, this.fallback.get('stats:activity-observed-since') || String(now)] as [number, string],
    );
    const since = Number(started);
    return { count: Number(count), observedSince: new Date(since).toISOString(), complete: now - since >= 86400000 };
  }

  async countActiveUsers(now = Date.now()): Promise<number> {
    return (await this.activeUserStats(now)).count;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.withFallback(
      () => this.client.hgetall(key),
      () => this.fallback.hgetall(key),
    );
  }

  async hgetallMany(keys: string[]): Promise<Record<string, string>[]> {
    if (!keys.length) return [];
    return this.withFallback(
      async () => {
        const pipeline = this.client.pipeline();
        keys.forEach((key) => pipeline.hgetall(key));
        const results = await pipeline.exec();
        return (results || []).map(([error, value]) => error ? {} : value as Record<string, string>);
      },
      () => keys.map((key) => this.fallback.hgetall(key)),
    );
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.withFallback(
      () => this.client.hdel(key, ...fields),
      () => this.fallback.hdel(key, ...fields),
    );
  }

  /** Batch read string keys using one Redis round trip. */
  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (!keys.length) return [];
    return this.withFallback(
      () => this.client.mget(...keys),
      () => keys.map((key) => this.fallback.get(key)),
    );
  }

  /** Atomically consume a value only when its stored owner matches. */
  async getAndDeleteIfMatches(key: string, expectedValue: string): Promise<string | null> {
    return this.client.eval(
      "local value = redis.call('GET', KEYS[1]); if value and string.sub(value, 1, string.len(ARGV[1])) == ARGV[1] then redis.call('DEL', KEYS[1]); return value; end; return false",
      1,
      key,
      expectedValue,
    ) as Promise<string | null>;
  }

  /**
   * Append a short-lived user event to a Redis Stream. Multiplayer payloads are
   * deliberately stored only in Redis and are never copied to operation logs.
   */
  async appendRealtimeEvent(stream: string, event: string, data: Record<string, unknown>): Promise<string> {
    const id = await this.client.xadd(
      stream,
      'MAXLEN', '~', '10000', '*',
      'event', event,
      'timestamp', String(Date.now()),
      'data', JSON.stringify(data),
    );
    if (!id) throw new Error('Redis Stream did not return an event id');
    await this.client.expire(stream, 600);
    return id;
  }

  async readRealtimeEvents(stream: string, start: string, count = 200): Promise<Array<[string, string[]]>> {
    return this.client.xrange(stream, start, '+', 'COUNT', count) as Promise<Array<[string, string[]]>>;
  }

  async firstRealtimeEvent(stream: string): Promise<Array<[string, string[]]>> {
    return this.client.xrange(stream, '-', '+', 'COUNT', 1) as Promise<Array<[string, string[]]>>;
  }

  async latestRealtimeEvent(stream: string): Promise<string> {
    const rows = await this.client.xrevrange(stream, '+', '-', 'COUNT', 1);
    return rows[0]?.[0] || '0-0';
  }

  async publishRealtime(channel: string, payload: string): Promise<void> {
    await this.client.publish(channel, payload);
  }

  /**
   * Fixed-window counter for the rate-limit guard.
   *
   * This used to call `client.eval` directly, so a Redis outage made the guard
   * throw — and because the guard fails open, rate limiting silently disappeared
   * exactly when an overloaded site needed it most. The fallback implements the
   * window in process memory (INCR plus EXPIRE armed for the first hit) so the
   * limit keeps applying while Redis is down.
   */
  async incrementFixedWindow(key: string, windowSeconds: number): Promise<number> {
    return this.withFallback(
      async () =>
        Number(
          (await this.client.eval(
            `local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return current`,
            1,
            key,
            windowSeconds,
          )) as number,
        ),
      () => {
        if (this.fallback.ttl(key) < 0) this.fallback.expireAfterNextIncr(key, windowSeconds);
        return this.fallback.incr(key);
      },
    );
  }

  /**
   * Lua script execution.
   *
   * There is no fallback: callers rely on Redis to run state transitions
   * atomically (including MindAuth refresh recovery). Each caller handles an
   * outage according to its contract; token rotation fails closed, while rate
   * limiting — which must degrade rather than disappear — goes through
   * `incrementFixedWindow` instead. Do not emulate scripts in process and risk
   * divergent state across workers.
   */
  async eval(script: string, keys: string[], args: (string | number)[]): Promise<any> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  // Sorted set operations (for popular searches, leaderboards, etc.)

  /**
   * Increment score for a member in a sorted set
   */
  async zIncrBy(key: string, increment: number, member: string): Promise<number> {
    return this.withFallback(
      async () => parseFloat(await this.client.zincrby(key, increment, member)),
      () => this.fallback.zIncrBy(key, increment, member),
    );
  }

  /**
   * Get top N members from a sorted set (highest score first)
   */
  async zRevRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.withFallback(
      () => this.client.zrevrange(key, start, stop),
      () => this.fallback.zRevRange(key, start, stop),
    );
  }

  /**
   * Get member score in a sorted set
   */
  async zScore(key: string, member: string): Promise<number | null> {
    return this.withFallback(
      async () => {
        const score = await this.client.zscore(key, member);
        return score !== null ? parseInt(score, 10) : null;
      },
      () => {
        const ranked = this.fallback.zRevRange(key, 0, -1);
        return ranked.includes(member) ? 1 : null;
      },
    );
  }
}
