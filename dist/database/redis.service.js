"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = class RedisService {
    constructor(config) {
        this.config = config;
    }
    async onModuleInit() {
        this.client = new ioredis_1.default({
            host: this.config.get('redis.host'),
            port: this.config.get('redis.port'),
            password: this.config.get('redis.password') || undefined,
            db: this.config.get('redis.db'),
            retryStrategy: (times) => Math.min(times * 50, 2000),
        });
        this.client.on('error', (err) => {
            console.error('Redis error:', err.message);
        });
    }
    async onModuleDestroy() {
        await this.client.quit();
    }
    getClient() {
        return this.client;
    }
    getConnectionConfig() {
        return {
            host: this.config.get('redis.host'),
            port: this.config.get('redis.port'),
            password: this.config.get('redis.password') || undefined,
            db: this.config.get('redis.db'),
        };
    }
    async get(key) {
        return this.client.get(key);
    }
    async set(key, value, ttl) {
        if (ttl) {
            return this.client.set(key, value, 'EX', ttl);
        }
        return this.client.set(key, value);
    }
    async del(key) {
        return this.client.del(key);
    }
    async exists(key) {
        return this.client.exists(key);
    }
    async expire(key, seconds) {
        return this.client.expire(key, seconds);
    }
    async ttl(key) {
        return this.client.ttl(key);
    }
    async incr(key) {
        return this.client.incr(key);
    }
    async keys(pattern) {
        return this.client.keys(pattern);
    }
    async hget(key, field) {
        return this.client.hget(key, field);
    }
    async hset(key, field, value) {
        return this.client.hset(key, field, value);
    }
    async hgetall(key) {
        return this.client.hgetall(key);
    }
    async hdel(key, ...fields) {
        return this.client.hdel(key, ...fields);
    }
    async eval(script, keys, args) {
        return this.client.eval(script, keys.length, ...keys, ...args);
    }
    async zIncrBy(key, increment, member) {
        const result = await this.client.zincrby(key, increment, member);
        return parseFloat(result);
    }
    async zRevRange(key, start, stop) {
        return this.client.zrevrange(key, start, stop);
    }
    async zScore(key, member) {
        const score = await this.client.zscore(key, member);
        return score !== null ? parseInt(score, 10) : null;
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map