import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on('error', (err) => {
      console.error('Redis error:', err.message);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  // String operations
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<'OK' | null> {
    if (ttl) {
      return this.client.set(key, value, 'EX', ttl);
    }
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  // Lua script execution
  async eval(script: string, keys: string[], args: (string | number)[]): Promise<any> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  // Sorted set operations (for popular searches, leaderboards, etc.)

  /**
   * Increment score for a member in a sorted set
   */
  async zIncrBy(key: string, increment: number, member: string): Promise<number> {
    const result = await this.client.zincrby(key, increment, member);
    return parseFloat(result);
  }

  /**
   * Get top N members from a sorted set (highest score first)
   */
  async zRevRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(key, start, stop);
  }

  /**
   * Get member score in a sorted set
   */
  async zScore(key: string, member: string): Promise<number | null> {
    const score = await this.client.zscore(key, member);
    return score !== null ? parseInt(score, 10) : null;
  }
}
