import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private config;
    private client;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    getClient(): Redis;
    getConnectionConfig(): {
        host: string | undefined;
        port: number | undefined;
        password: string | undefined;
        db: number | undefined;
    };
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<'OK' | null>;
    del(key: string): Promise<number>;
    exists(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    hget(key: string, field: string): Promise<string | null>;
    hset(key: string, field: string, value: string): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    hdel(key: string, ...fields: string[]): Promise<number>;
    eval(script: string, keys: string[], args: (string | number)[]): Promise<any>;
    zIncrBy(key: string, increment: number, member: string): Promise<number>;
    zRevRange(key: string, start: number, stop: number): Promise<string[]>;
    zScore(key: string, member: string): Promise<number | null>;
}
