# 日志与监控设计

> 本文档记录了论坛系统的日志与监控设计方案。
> 创建时间: 2026-06-07

## 日志架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        日志系统                                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Winston  │  │ 日志     │  │ 健康     │  │ 性能         │   │
│  │ Logger   │  │ 轮转     │  │ 检查     │  │ 监控         │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Winston 日志配置

### 日志级别
| 级别 | 说明 | 示例 |
|------|------|------|
| `error` | 错误 | 数据库连接失败、API 调用失败 |
| `warn` | 警告 | 频率限制触发、敏感词匹配 |
| `info` | 信息 | 用户登录、帖子创建 |
| `debug` | 调试 | SQL 查询、Redis 操作 |
| `verbose` | 详细 | 请求详情 |

### 配置
```typescript
// config/winston.config.ts
import * as winston from 'winston';
import 'winston-daily-rotate-file';

export const WinstonConfig = {
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
          return `[${timestamp}] ${level} [${context || 'Application'}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      ),
    }),

    // 错误日志文件
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',       // 单个文件最大 20MB
      maxFiles: '30d',      // 保留 30 天
      zippedArchive: true,  // 自动压缩
    }),

    // 综合日志文件
    new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
  ],
};
```

### 使用方式
```typescript
// NestJS Logger
@Injectable()
export class AppLogger extends Logger {
  error(message: string, trace?: string, context?: string) {
    super.error(message, trace, context);
    // 同时写入 Winston
    this.winstonLogger.error(message, { context, trace });
  }

  info(message: string, context?: string) {
    super.log(message, context);
    this.winstonLogger.info(message, { context });
  }
}

// 在 Service 中注入
@Injectable()
export class PostService {
  constructor(private logger: AppLogger) {}

  async create(dto: CreatePostDto, userId: number) {
    this.logger.info(`Post created by user ${userId}`, 'PostService');
    // ...
  }
}
```

---

## 日志格式

### 结构化日志
```json
{
  "timestamp": "2026-06-07T10:00:00Z",
  "level": "info",
  "context": "PostService",
  "message": "Post created successfully",
  "data": {
    "postId": 123,
    "userId": 456,
    "categoryId": 1,
    "title": "帖子标题"
  },
  "requestId": "req-abc-123",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

### 日志字段规范
| 字段 | 必填 | 说明 |
|------|------|------|
| timestamp | 是 | ISO 8601 格式 |
| level | 是 | 日志级别 |
| context | 是 | 模块/服务名 |
| message | 是 | 日志描述 |
| data | 否 | 结构化数据 |
| requestId | 否 | 请求追踪 ID |
| userId | 否 | 操作用户 |
| ip | 否 | 请求 IP |

---

## 健康检查

### 健康端点
```
GET /health
```

### 检查项目
| 检查项 | 说明 |
|--------|------|
| 应用状态 | NestJS 应用是否正常运行 |
| 数据库连接 | MySQL 连接是否正常 |
| Redis 连接 | Redis 连接是否正常 |
| 磁盘空间 | 日志目录磁盘空间是否充足 |

### 实现
```typescript
// modules/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private healthCheckService: HealthCheckService,
    private dbHealthIndicator: TypeOrmHealthIndicator,
    private redisHealthIndicator: RedisHealthIndicator,
  ) {}

  @Get()
  async check() {
    const result = await this.healthCheckService.check([
      () => this.dbHealthIndicator.pingCheck('database'),
      () => this.redisHealthIndicator.pingCheck('redis'),
      () => this.checkDiskSpace(),
    ]);

    return result;
  }
}
```

### 响应格式
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "disk": { "status": "up", "availableGB": 50 }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "disk": { "status": "up", "availableGB": 50 }
  }
}
```

---

## 性能监控指标

### 系统指标
| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| CPU 使用率 | 后端进程 CPU 占用 | > 80% |
| 内存使用率 | 后端进程内存占用 | > 80% |
| 磁盘使用率 | 日志/存储磁盘 | > 90% |

### API 指标
| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| 响应时间（P50） | 50% 请求的响应时间 | > 500ms |
| 响应时间（P95） | 95% 请求的响应时间 | > 2000ms |
| 响应时间（P99） | 99% 请求的响应时间 | > 5000ms |
| 错误率 | 5xx 错误比例 | > 1% |
| QPS | 每秒请求数 | 视服务器配置 |

### 数据库监控
| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| 慢查询数 | 执行时间 > 1s 的查询 | 每分钟 > 10 |
| 连接数 | 当前数据库连接数 | > 80% 最大连接数 |
| 锁等待时间 | 行锁等待时间 | > 5s |

### Redis 监控
| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| 命中率 | 缓存命中率 | < 60% |
| 连接数 | 当前 Redis 连接数 | > 80% 最大连接数 |
| 内存使用率 | Redis 内存占用 | > 80% |

---

## 请求日志中间件

```typescript
// common/middleware/request-logger.middleware.ts
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    
    req.headers['x-request-id'] = requestId;

    res.on('finish', () => {
      const duration = Date.now() - start;
      
      this.logger.info(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
        'HTTP',
        {
          requestId,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          userId: req.user?.id,
          duration,
        }
      );
    });

    next();
  }
}
```

---

## Docker 健康检查

```dockerfile
# Dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1
```

---

## 日志查询与分析

### 开发环境
- 直接查看日志文件：`tail -f logs/combined-2026-06-07.log`
- 使用 `grep` 过滤：`grep "error" logs/combined-2026-06-07.log`

### 生产环境
- Docker logs：`docker logs forum-backend --follow`
- 可选集成：ELK Stack（Elasticsearch + Logstash + Kibana）或 Grafana Loki

### 日志保留策略
| 日志类型 | 保留时间 | 存储位置 |
|----------|----------|----------|
| 错误日志 | 90 天 | 本地文件 + 可选远程 |
| 综合日志 | 30 天 | 本地文件 |
| 请求日志 | 7 天 | 本地文件 |
| 操作审计日志 | 永久 | 数据库 |
