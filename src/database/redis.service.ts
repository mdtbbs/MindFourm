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
    await this.client.quit().catch(() => undefined);
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

  async del(key: string): Promise<number> {
    return this.withFallback(
      () => this.client.del(key),
      () => this.fallback.del(key),
    );
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

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.withFallback(
      () => this.client.hgetall(key),
      () => this.fallback.hgetall(key),
    );
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.withFallback(
      () => this.client.hdel(key, ...fields),
      () => this.fallback.hdel(key, ...fields),
    );
  }

  /**
   * Lua script execution.
   *
   * There is no fallback: the only script in use is the rate limiter's atomic
   * INCR + EXPIRE, and `RateLimitGuard` already treats a failure here as "skip the
   * check" so a Redis outage degrades rate limiting rather than blocking traffic.
   * Emulating arbitrary Lua in process would be a much larger promise than that.
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
