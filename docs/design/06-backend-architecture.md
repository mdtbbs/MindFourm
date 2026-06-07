# 后端架构设计

> 本文档记录了论坛系统的后端架构设计方案（NestJS）。
> 创建时间: 2026-06-07

## 技术选型

| 项目 | 选择 |
|------|------|
| 框架 | NestJS + TypeScript |
| ORM | TypeORM |
| 数据库 | MySQL 8 + Redis 7 |
| 认证 | MindAuth OAuth + JWT |
| 验证 | class-validator + class-transformer |
| 文档 | Swagger (@nestjs/swagger) |
| 日志 | NestJS 内置 Logger + Winston |
| 实时通信 | SSE (@Sse() 装饰器 + Redis Pub/Sub) |
| 缓存 | Redis + class-cache-interceptor |
| 异常处理 | 全局异常过滤器 + 自定义业务异常 |

---

## 模块组织（按技术层划分）

```
backend/
├── src/
│   ├── main.ts                          # 应用入口
│   ├── app.module.ts                    # 根模块
│   │
│   ├── config/                          # 配置层
│   │   ├── config.module.ts
│   │   ├── database.config.ts           # TypeORM 配置
│   │   ├── redis.config.ts              # Redis 配置
│   │   ├── oauth.config.ts              # MindAuth OAuth 配置
│   │   └── app.config.ts               # 应用配置
│   │
│   ├── common/                          # 公共层
│   │   ├── decorators/                  # 自定义装饰器
│   │   │   ├── permissions.decorator.ts # @Permissions() 权限装饰器
│   │   │   ├── current-user.decorator.ts # @CurrentUser() 用户装饰器
│   │   │   └── public.decorator.ts      # @Public() 公开端点装饰器
│   │   │
│   │   ├── filters/                     # 异常过滤器
│   │   │   ├── global-exception.filter.ts # 全局异常过滤器
│   │   │   └── http-exception.filter.ts   # HTTP 异常过滤器
│   │   │
│   │   ├── guards/                      # 守卫
│   │   │   ├── auth.guard.ts            # JWT 认证守卫
│   │   │   ├── permission.guard.ts      # RBAC 权限守卫
│   │   │   └── rate-limit.guard.ts      # 频率限制守卫
│   │   │
│   │   ├── interceptors/                # 拦截器
│   │   │   ├── logging.interceptor.ts   # 请求日志拦截器
│   │   │   ├── cache.interceptor.ts     # Redis 缓存拦截器
│   │   │   └── transform.interceptor.ts # 响应格式统一拦截器
│   │   │
│   │   ├── pipes/                       # 管道
│   │   │   ├── validation.pipe.ts       # 请求验证管道
│   │   │   └── parse-int.pipe.ts        # 整数解析管道
│   │   │
│   │   └── middleware/                  # 中间件
│   │       ├── logger.middleware.ts     # 请求日志
│   │       ├── cors.middleware.ts       # CORS 配置
│   │       ├── body-size.middleware.ts  # 请求体大小限制
│   │       └── request-id.middleware.ts # 请求 ID 追踪
│   │
│   ├── shared/                          # 共享层
│   │   ├── dto/                         # 通用 DTO
│   │   │   ├── pagination.dto.ts        # 分页参数 DTO
│   │   │   └── response.dto.ts          # 统一响应 DTO
│   │   │
│   │   ├── types/                       # 类型定义
│   │   │   ├── user.types.ts
│   │   │   ├── post.types.ts
│   │   │   ├── reply.types.ts
│   │   │   └── permission.types.ts
│   │   │
│   │   ├── utils/                       # 工具函数
│   │   │   ├── content-filter.util.ts   # 敏感词过滤（DFA）
│   │   │   ├── markdown.util.ts         # Markdown 渲染
│   │   │   ├── mention.util.ts          # @提及 解析
│   │   │   └── pagination.util.ts       # 分页工具
│   │   │
│   │   └── constants/                   # 常量
│   │       ├── permissions.constants.ts # 权限节点常量
│   │       └── error-codes.constants.ts # 错误码常量
│   │
│   ├── modules/                         # 业务模块层
│   │   ├── auth/                        # 认证模块
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── dto/
│   │   │       ├── oauth-callback.dto.ts
│   │   │       └── verify.dto.ts
│   │   │
│   │   ├── users/                       # 用户模块
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.service.spec.ts
│   │   │   ├── entities/
│   │   │   │   ├── user.entity.ts
│   │   │   │   ├── user-role.entity.ts
│   │   │   │   └── user-badge.entity.ts
│   │   │   └── dto/
│   │   │       ├── create-user.dto.ts
│   │   │       ├── update-profile.dto.ts
│   │   │       └── follow.dto.ts
│   │   │
│   │   ├── posts/                       # 帖子模块
│   │   │   ├── posts.module.ts
│   │   │   ├── posts.controller.ts
│   │   │   ├── posts.service.ts
│   │   │   ├── post-edits.service.ts
│   │   │   ├── poll.service.ts
│   │   │   ├── attachment.service.ts
│   │   │   ├── entities/
│   │   │   │   ├── post.entity.ts
│   │   │   │   ├── post-edit.entity.ts
│   │   │   │   ├── poll.entity.ts
│   │   │   │   ├── poll-option.entity.ts
│   │   │   │   ├── poll-vote.entity.ts
│   │   │   │   └── attachment.entity.ts
│   │   │   └── dto/
│   │   │       ├── create-post.dto.ts
│   │   │       ├── update-post.dto.ts
│   │   │       └── poll.dto.ts
│   │   │
│   │   ├── replies/                     # 回复模块
│   │   │   ├── replies.module.ts
│   │   │   ├── replies.controller.ts
│   │   │   ├── replies.service.ts
│   │   │   ├── reply-edits.service.ts
│   │   │   ├── entities/
│   │   │   │   ├── reply.entity.ts
│   │   │   │   └── reply-edit.entity.ts
│   │   │   └── dto/
│   │   │
│   │   ├── notifications/               # 通知模块
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts
│   │   │   ├── sse.gateway.ts           # SSE 网关
│   │   │   ├── sse.service.ts           # SSE 服务
│   │   │   ├── email.service.ts         # 邮件通知服务
│   │   │   ├── entities/
│   │   │   │   └── notification.entity.ts
│   │   │   └── dto/
│   │   │
│   │   ├── reports/                     # 举报模块
│   │   │   ├── reports.module.ts
│   │   │   ├── reports.controller.ts
│   │   │   ├── reports.service.ts
│   │   │   ├── entities/
│   │   │   │   └── report.entity.ts
│   │   │   └── dto/
│   │   │
│   │   ├── categories/                  # 分类模块
│   │   ├── tags/                        # 标签模块
│   │   ├── bookmarks/                   # 收藏模块
│   │   ├── likes/                       # 点赞模块
│   │   ├── messages/                    # 私信模块
│   │   ├── points/                      # 积分模块
│   │   ├── badges/                      # 徽章模块
│   │   ├── reputation/                  # 声望模块
│   │   ├── online/                      # 在线状态模块
│   │   ├── follows/                     # 关注模块
│   │   │
│   │   └── admin/                       # 管理后台模块
│   │       ├── admin.module.ts
│   │       ├── admin.controller.ts
│   │       ├── dashboard.service.ts
│   │       ├── settings.service.ts
│   │       ├── announcements.service.ts
│   │       ├── sensitive-words.service.ts
│   │       ├── levels.service.ts
│   │       ├── groups.service.ts
│   │       ├── shop.service.ts
│   │       ├── plugins.service.ts
│   │       └── plugin-installer.service.ts
│   │
│   ├── entities/                        # 全局实体注册
│   │   └── index.ts
│   │
│   └── migrations/                      # 数据库迁移
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── .env.example
├── nest-cli.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## 全局中间件

| 中间件 | 功能 |
|--------|------|
| Logger | 记录请求方法、路径、耗时、IP、User-Agent |
| CORS | 配置允许的域名、方法、头部 |
| Body Size | 限制请求体大小（默认 10MB） |
| Request ID | 为每个请求生成唯一 ID，用于日志追踪 |

---

## 异常处理

### 全局异常过滤器

```typescript
// common/filters/global-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let errorResponse: ErrorResponse;

    if (exception instanceof BusinessException) {
      errorResponse = {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request.headers['x-request-id'],
      };
    } else if (exception instanceof HttpException) {
      errorResponse = {
        code: 'HTTP_ERROR',
        message: exception.message,
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request.headers['x-request-id'],
      };
    } else {
      errorResponse = {
        code: 'INTERNAL_ERROR',
        message: 'Internal Server Error',
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request.headers['x-request-id'],
      };
    }

    response.status(errorResponse.code === 'INTERNAL_ERROR' ? 500 : 400).json(errorResponse);
  }
}
```

### 自定义业务异常

```typescript
// common/exceptions/business.exception.ts
export class BusinessException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: any,
  ) {
    super({ code, message, details }, 400);
  }
}

// 使用示例
throw new BusinessException('POST_NOT_FOUND', '帖子不存在');
throw new BusinessException('PERMISSION_DENIED', '你没有权限编辑此帖子');
throw new BusinessException('SENSITIVE_WORD_BLOCKED', '内容包含敏感词', { words: ['敏感词1'] });
```

### 错误码规范

| 错误码前缀 | 说明 |
|------------|------|
| `AUTH_` | 认证相关（未登录、token 过期等） |
| `PERMISSION_` | 权限相关（无权限操作） |
| `POST_` | 帖子相关（不存在、已删除等） |
| `REPLY_` | 回复相关 |
| `USER_` | 用户相关（不存在、已封禁等） |
| `VALIDATION_` | 参数验证 |
| `SENSITIVE_` | 敏感词相关 |
| `INTERNAL_` | 服务器内部错误 |

---

## SSE 实现（NestJS 内置 + Redis）

### SSE Gateway

```typescript
// modules/notifications/sse.gateway.ts
@Get('events')
@Sse()
sse(@Req() req: Request): Observable<MessageEvent> {
  return this.sseService.subscribe(req.user.id);
}
```

### SSE Service

```typescript
// modules/notifications/sse.service.ts
@Injectable()
export class SseService {
  private clients = new Map<number, Subject<MessageEvent>>();

  constructor(private redisService: RedisService) {
    // 订阅 Redis Pub/Sub 通道
    this.redisService.subscribe('notifications').subscribe((message) => {
      const { userId, event, data } = JSON.parse(message);
      this.notify(userId, event, data);
    });
  }

  subscribe(userId: number): Observable<MessageEvent> {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Subject<MessageEvent>());
    }
    return this.clients.get(userId).asObservable();
  }

  notify(userId: number, event: string, data: any) {
    const client = this.clients.get(userId);
    if (client) {
      client.next({ type: event, data });
    }
  }

  broadcast(event: string, data: any) {
    this.clients.forEach((client) => {
      client.next({ type: event, data });
    });
  }
}
```

### 多实例扩展（Redis Pub/Sub）

```typescript
// 发送通知到 Redis Pub/Sub
await this.redisService.publish('notifications', JSON.stringify({
  userId: targetUserId,
  event: 'notification',
  data: notification,
}));
```

---

## RBAC 权限守卫

```typescript
// common/guards/permission.guard.ts
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<string[]>('permissions', context.getHandler());
    if (!requiredPermissions) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    for (const permission of requiredPermissions) {
      const hasPermission = await this.permissionService.checkPermission(user.id, permission);
      if (hasPermission) return true;
    }

    return false;
  }
}
```

### 使用示例

```typescript
@UseGuards(AuthGuard, PermissionGuard)
@Controller('posts')
export class PostsController {
  @Post()
  @Permissions('post_create')
  async create(@Body() dto: CreatePostDto, @CurrentUser() user: User) {
    return this.postsService.create(dto, user.id);
  }

  @Put(':id')
  @Permissions('post_edit_own', 'post_edit_any')
  async update(@Param('id') id: number, @Body() dto: UpdatePostDto, @CurrentUser() user: User) {
    return this.postsService.update(id, dto, user.id);
  }
}
```

---

## 响应格式统一

```typescript
// common/interceptors/transform.interceptor.ts
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        data,
        timestamp: new Date().toISOString(),
        requestId: context.switchToHttp().getRequest().headers['x-request-id'],
      })),
    );
  }
}
```

---

## 缓存策略

| 数据类型 | 缓存时间 | 策略 |
|----------|----------|------|
| 用户权限列表 | 5 分钟 | Redis STRING |
| 系统设置 | 5 分钟 | Redis STRING |
| 用户在线状态 | 实时更新 | Redis SET |
| 帖子列表（首页） | 1 分钟 | Redis STRING |
| 帖子详情 | 5 分钟 | Redis STRING |
| 热门分类 | 5 分钟 | Redis STRING |
| 徽章定义 | 30 分钟 | Redis STRING |
| 用户资料 | 5 分钟 | Redis STRING |

---

## 模块依赖关系

```
app.module
├── config.module
├── common (guards, filters, interceptors, pipes, middleware)
├── auth.module → users.module, redis
├── users.module → users entities, redis
├── posts.module → posts entities, attachments, polls
├── replies.module → replies entities
├── notifications.module → SSE, email
├── reports.module → reports entities
├── categories.module → categories entities
├── tags.module → tags entities
├── bookmarks.module → bookmarks entities
├── likes.module → likes entities
├── messages.module → messages entities
├── points.module → points entities
├── badges.module → badges entities
├── reputation.module → reputation entities
├── online.module → redis
├── follows.module → follows entities
└── admin.module → settings, announcements, sensitive-words, levels, groups, shop, plugins
```
