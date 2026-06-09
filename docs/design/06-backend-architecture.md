# 后端架构设计

> 本文档记录了 MindFourm 论坛系统的 NestJS 后端架构设计。
> 创建时间: 2026-06-07 | 更新时间: 2026-06-08

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | NestJS v10 + TypeScript |
| ORM | TypeORM |
| 数据库 | MySQL 8 + Redis 7 |
| 认证 | MindAuth OAuth + Redis Session |
| 验证 | class-validator + class-transformer |
| 响应格式 | 全局拦截器 + 异常过滤器 |

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          NestJS Application                               │
│  Entry: src/main.ts → Bootstrap (CORS, ValidationPipe, Filters, etc.)    │
│  Root: src/app.module.ts → Imports 21 Feature Modules                     │
└──────────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Feature Layer  │  │   Common Layer  │  │  Database Layer │
│  src/modules/   │  │   src/common/   │  │   src/database/ │
│  21 Modules     │  │ Guards/Decorators│  │  TypeORM+Redis  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
          │                   │                   │
          └───────────────────┴───────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Entities      │
                    │   src/entities/ │
                    │   19 Entities   │
                    └─────────────────┘
```

---

## 目录结构

```
MindFourm/
├── src/
│   ├── main.ts                          # 应用入口（Bootstrap）
│   ├── app.module.ts                    # 根模块（导入21个功能模块）
│   │
│   ├── config/                          # 配置层
│   │   └── app.config.ts               # 环境变量配置（app/mysql/redis/mindauth/easymanager）
│   │
│   ├── database/                        # 数据库层
│   │   ├── database.module.ts          # TypeORM MySQL 连接（全局模块）
│   │   ├── redis.module.ts             # Redis 导出模块
│   │   └── redis.service.ts            # Redis 服务（get/set/hset/eval等）
│   │
│   ├── common/                          # 公共层
│   │   ├── decorators/                  # 自定义装饰器
│   │   │   ├── public.decorator.ts     # @Public() 公开端点装饰器
│   │   │   └── roles.decorator.ts      # @Roles() + @Permissions() 装饰器
│   │   │
│   │   ├── guards/                      # 守卫
│   │   │   ├── jwt-auth.guard.ts       # Redis Session 验证守卫
│   │   │   ├── roles.guard.ts          # 角色层级守卫
│   │   │   ├── permissions.guard.ts    # 权限/所有权守卫
│   │   │   ├── ban.guard.ts            # IP/用户封禁检查守卫
│   │   │   ├── rate-limit.guard.ts     # Lua脚本原子限流守卫
│   │   │   └── service-auth.guard.ts   # X-Service-Key 服务认证守卫
│   │   │
│   │   ├── filters/                     # 异常过滤器
│   │   │   └── all-exceptions.filter.ts # 全局异常过滤器
│   │   │
│   │   ├── interceptors/                # 拦截器
│   │   │   └── response.interceptor.ts # 响应格式统一拦截器
│   │   │
│   │   ├── utils/                       # 工具函数
│   │   │   ├── constants.ts            # 常量（ROLES, STATUS, PERMISSIONS等）
│   │   │   ├── cursor.util.ts          # Cursor分页编解码
│   │   │   ├── markdown.util.ts        # Markdown解析+sanitize
│   │   │   └── response.util.ts        # ResponseUtil响应辅助类
│   │   │
│   │   └── health.controller.ts        # 健康检查端点
│   │
│   ├── modules/                         # 业务模块层（21个模块）
│   │   ├── posts/                       # 帖子模块（901行）
│   │   ├── admin/                       # 管理后台模块（813行）
│   │   ├── resources/                   # 资源中心模块（835行）
│   │   ├── notifications/               # 通知模块（966行）
│   │   ├── auth/                        # 认证模块（355行）
│   │   ├── bans/                        # 封禁模块（315行）
│   │   ├── likes/                       # 点赞模块（275行）
│   │   ├── replies/                     # 回复模块（290行）
│   │   ├── users/                       # 用户模块（271行）
│   │   ├── tags/                        # 标签模块（241行）
│   │   ├── attachments/                 # 附件模块（209行）
│   │   ├── messages/                    # 私信模块（199行）
│   │   ├── servers/                     # 服务器模块（167行）
│   │   ├── settings/                    # 设置模块（166行）
│   │   ├── bookmarks/                   # 收藏模块（151行）
│   │   ├── categories/                  # 分类模块（108行）
│   │   ├── post-servers/                # 帖子-服务器关联模块（135行）
│   │   ├── auto-post/                   # 自动发帖模块（137行）
│   │   ├── stats/                       # 统计模块（99行）
│   │   └── logs/                        # 日志模块（109行）
│   │
│   └── entities/                        # 实体层（19个实体）
│       ├── index.ts                     # 实体导出索引
│       ├── user.entity.ts               # 用户实体
│       ├── post.entity.ts               # 帖子实体
│       ├── reply.entity.ts              # 回复实体
│       ├── category.entity.ts           # 分类实体
│       ├── tag.entity.ts                # 标签实体
│       ├── post-tag.entity.ts           # 帖子-标签关联
│       ├── bookmark.entity.ts           # 收藏实体
│       ├── notification.entity.ts       # 通知实体
│       ├── message.entity.ts            # 私信实体
│       ├── attachment.entity.ts         # 附件实体
│       ├── resource.entity.ts           # 资源实体
│       ├── resource-category.entity.ts  # 资源分类
│       ├── resource-version.entity.ts   # 资源版本
│       ├── post-like.entity.ts          # 帖子点赞
│       ├── reply-like.entity.ts         # 回复点赞
│       ├── ban.entity.ts                # 封禁实体
│       ├── setting.entity.ts            # 设置实体
│       ├── operation-log.entity.ts      # 操作日志
│       └── session-audit.entity.ts      # 会话审计
│
├── uploads/                             # 上传文件目录
│   ├── avatars/                         # 头像目录
│   ├── attachments/                     # 附件目录
│   └── resources/                       # 资源目录
│
├── public/                              # 公共静态资源
│
├── test/                                # 测试目录
│
├── package.json
├── nest-cli.json
├── tsconfig.json
└── .env
```

---

## 应用入口（main.ts）

Bootstrap 配置：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. 全局路由前缀
  app.setGlobalPrefix('api');

  // 2. 全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // 剔除未定义属性
    forbidNonWhitelisted: true, // 拒绝未定义属性
    transform: true,           // 自动类型转换
  }));

  // 3. 全局响应拦截器
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 4. 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 5. CORS 配置
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  // 6. 数据库初始化
  await initializeDatabase();

  await app.listen(4000);
}
```

---

## 配置管理（app.config.ts）

环境变量配置结构：

```typescript
export const appConfig = () => ({
  app: {
    port: parseInt(process.env.PORT || '4000', 10),
    env: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL || 'http://localhost:4000',
  },
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mindforum',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  mindauth: {
    baseUrl: process.env.MINDAUTH_URL || 'http://localhost:4001',
    clientId: process.env.MINDAUTH_CLIENT_ID || 'forum',
    clientSecret: process.env.MINDAUTH_CLIENT_SECRET || '',
    callbackUrl: process.env.MINDAUTH_CALLBACK_URL,
  },
  easymanager: {
    baseUrl: process.env.EASYMANAGER_URL || 'http://localhost:5001',
    apiKey: process.env.EASYMANAGER_API_KEY || '',
  },
  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});
```

---

## 请求生命周期

```
HTTP Request
    │
    ▼
┌─────────────────┐
│   Middleware    │  (未使用全局中间件，由 Guards 替代)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│    Guards       │  JwtAuthGuard → RolesGuard → BanGuard → RateLimitGuard
│                 │  @Public() 跳过认证，@Roles() 角色检查
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Interceptors    │  ResponseInterceptor（响应包装）
│    (Before)     │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│    Pipes        │  ValidationPipe（DTO验证 + 类型转换）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│   Controller    │  @Controller, @Get, @Post, @Put, @Delete
│                 │  参数注入：@Body, @Query, @Param, @Req
└─────────────────┘
    │
    ▼
┌─────────────────┐
│    Service      │  业务逻辑 + Repository 注入 + Redis 缓存
│                 │  DataSource.transaction() 事务管理
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Interceptors    │  ResponseInterceptor（包装响应为 { success, data }）
│    (After)      │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Exception Filter│  AllExceptionsFilter（统一错误响应）
│   (On Error)    │  HttpException → { success: false, message }
└─────────────────┘
    │
    ▼
HTTP Response
```

---

## Common Layer（公共层）

### Guards（守卫）

| 守卫 | 功能 | 实现细节 |
|------|------|----------|
| `JwtAuthGuard` | Redis Session 验证 | 从 Cookie/Header 提取 session_token → Redis 验证 → 滑动窗口刷新 TTL |
| `RolesGuard` | 角色层级检查 | ROLES 常量：guest(0) < user(1) < moderator(2) < admin(3) |
| `PermissionsGuard` | 权限/所有权检查 | PERMISSIONS 常量定义权限节点，fallback 检查资源所有权 |
| `BanGuard` | IP/用户封禁检查 | 调用 BansService.checkIp() 和 isActive() |
| `RateLimitGuard` | Lua脚本原子限流 | 嵌入式 Lua script：INCR + EXPIRE，按 IP + Handler 限流 |
| `ServiceAuthGuard` | 服务间认证 | 验证 X-Service-Key header 与配置匹配 |

#### JwtAuthGuard 实现

```typescript
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. 检查 @Public() 装饰器
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. 提取 session_token（Cookie 或 Authorization Header）
    const sessionToken = request.cookies?.forum_session 
      || this.extractTokenFromHeader(request);

    // 3. Redis 验证会话
    const user = await this.authService.verifySession(sessionToken);
    request.user = user;
    return true;
  }
}
```

#### RateLimitGuard Lua Script

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
```

限流配置：
- `handleCreate`: 10 posts/min
- `handleReply`: 30 replies/min
- `handleLogin`: 5 attempts/5min

### Decorators（装饰器）

| 装饰器 | 功能 | 使用示例 |
|--------|------|----------|
| `@Public()` | 标记公开端点 | `@Public() @Get('list')` |
| `@Roles('admin', 'moderator')` | 角色限制 | `@Roles('admin') @Delete(':id')` |
| `@Permissions('POST_DELETE_ANY')` | 权限限制 | `@Permissions('BAN_MANAGE')` |

### Filters（异常过滤器）

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(status).json({
        success: false,
        message: exceptionResponse.message,
      });
    } else {
      response.status(500).json({
        success: false,
        message: '服务器内部错误',
      });
    }
  }
}
```

### Interceptors（拦截器）

```typescript
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
      })),
    );
  }
}
```

### Utils（工具函数）

| 文件 | 功能 |
|------|------|
| `constants.ts` | ROLES, POST_STATUS, REPLY_STATUS, LOG_ACTIONS, PERMISSIONS, NOTIFICATION_TYPES |
| `cursor.util.ts` | encodeCursor(...values), decodeCursor(cursor) → base64url 编码 |
| `markdown.util.ts` | parseMarkdown(content) → marked + sanitize-html |
| `response.util.ts` | ResponseUtil.success/created/paginated/cursor/error |

---

## Database Layer（数据库层）

### DatabaseModule

```typescript
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('mysql.host'),
        // ... 其他配置
        entities,
        synchronize: false,  // 使用现有 schema
        timezone: '+08:00',
      }),
    }),
    RedisModule,
  ],
  exports: [TypeOrmModule, RedisModule],
})
export class DatabaseModule {}
```

### RedisService

完整的 Redis 操作封装：

| 方法 | 功能 |
|------|------|
| `get/set/del/exists` | 字符串操作 |
| `incr/expire/ttl` | 计数器/TTL管理 |
| `hget/hset/hgetall/hdel` | Hash操作 |
| `keys(pattern)` | 模式匹配 |
| `eval(script, keys, args)` | Lua脚本执行 |

**用途**：
- Session 存储：`session:${token}` → Hash(userId, createdAt)
- 帖子缓存：`post:${id}` → JSON(5分钟)
- 未读通知计数：`unread:${userId}` → String(5分钟)
- 视图计数限流：`post_view:${id}` → String(60秒)
- 限流计数：`rate_limit:${ip}:${handler}` → String(窗口秒)

---

## Module Layer（模块层）

21 个功能模块，按业务域划分：

### 模块结构

每个模块遵循 NestJS 标准结构：

```
modules/{module}/
├── {module}.module.ts      # 模块定义 + TypeORM imports
├── {module}.controller.ts  # REST 端点定义
├── {module}.service.ts     # 业务逻辑 + Repository 注入
└── dto/                    # class-validator DTOs
    ├── create-{entity}.dto.ts
    ├── update-{entity}.dto.ts
    └── query-{entity}.dto.ts
```

### 模块详情

| 模块 | 行数 | 功能 | 关键特性 |
|------|------|------|----------|
| **posts** | 901 | 帖子 CRUD | Markdown解析、标签关联、Redis缓存、Cursor分页、搜索 |
| **admin** | 813 | 管理后台 | 批量操作、审核队列、标签合并、清理任务 |
| **resources** | 835 | 资源中心 | 上传/外部资源、版本管理、审核状态 |
| **notifications** | 966 | 通知系统 | @提及解析、未读计数缓存、邮件队列 |
| **auth** | 355 | 认证 | MindAuth OAuth、Redis Session、会话审计 |
| **bans** | 315 | 封禁管理 | IP/CIDR范围封禁、内存缓存(10秒) |
| **likes** | 275 | 点赞 | 帖子/回复点赞、计数更新 |
| **replies** | 290 | 回复 | 嵌套回复、审核状态 |
| **users** | 271 | 用户 | Profile更新、头像上传、角色管理 |
| **tags** | 241 | 标签 | 自动slug生成、合并功能 |
| **attachments** | 209 | 附件 | Multer上传、文件管理 |
| **messages** | 199 | 私信 | Cursor分页、未读状态 |
| **servers** | 167 | 服务器 | 游戏服务器实体 CRUD |
| **settings** | 166 | 设置 | KV存储、内存缓存 |
| **bookmarks** | 151 | 收藏 | 帖子收藏 CRUD |
| **categories** | 108 | 分类 | 层级分类管理 |
| **post-servers** | 135 | 帖子-服务器 | 关联管理 |
| **auto-post** | 137 | 自动发帖 | EasyManager回调、服务器公告 |
| **stats** | 99 | 统计 | Dashboard统计、7天活动CTE |
| **logs** | 109 | 日志 | 操作日志记录 |

### PostsService 关键实现

```typescript
@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private postRepository: Repository<Post>,
    @InjectRepository(Tag) private tagRepository: Repository<Tag>,
    private dataSource: DataSource,
    private redisService: RedisService,
  ) {}

  // 事务创建帖子+标签
  async create(dto: CreatePostDto, userId: number): Promise<Post> {
    return this.dataSource.transaction(async (manager) => {
      const contentHtml = parseMarkdown(dto.content);
      const post = manager.create(Post, { ...dto, content_html: contentHtml });
      const saved = await manager.save(post);
      if (dto.tags) await this.attachTags(manager, saved.id, dto.tags);
      return manager.findOne(Post, { where: { id: saved.id }, relations: [...] });
    });
  }

  // Redis缓存读取+视图计数
  async findById(id: number): Promise<Post> {
    const cached = await this.redisService.get(`post:${id}`);
    if (cached) {
      await this.incrementViewCount(id); // 后台计数
      return JSON.parse(cached);
    }
    const post = await this.postRepository.findOne({ ... });
    await this.redisService.set(`post:${id}`, JSON.stringify(post), 300);
    return post;
  }

  // Cursor分页
  async findAllCursor(query: QueryPostsDto): Promise<CursorResult<Post>> {
    const { cursor, sort, limit } = query;
    // 解码cursor → 时间戳/ID条件
    // 查询 limit+1 → 判断 hasMore
    // 编码nextCursor
  }
}
```

### NotificationsService @提及解析

```typescript
async notifyMentionedUsers(
  content: string,
  postId: number,
  actorId: number,
): Promise<Notification[]> {
  const mentionRegex = /@(\w+)/g;
  const usernames = [...new Set(content.matchAll(mentionRegex).map(m => m[1]))];
  
  const mentionedUsers = await this.userRepository.find({
    where: usernames.map(username => ({ username })),
  });

  for (const user of mentionedUsers) {
    if (user.id !== actorId) {
      await this.create({
        user_id: user.id,
        type: 'mention',
        actor_id: actorId,
        post_id: postId,
      });
    }
  }
}
```

### BansService CIDR范围匹配

```typescript
async checkIp(ip: string): Promise<boolean> {
  // 内存缓存检查（10秒TTL）
  this.maybeRefreshCache();
  
  // 精确IP匹配
  if (this.banCache.has(`ip:${ip}`)) return true;

  // CIDR范围匹配
  for (const [key, entry] of this.banCache.entries()) {
    if (entry.ban_type === 'ip_range' && this.ipInRange(ip, entry.value)) {
      return true;
    }
  }
  return false;
}

ipInRange(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  return (this.ipToNum(ip) & mask) === (this.ipToNum(range) & mask);
}
```

---

## Entities（实体层）

19 个 TypeORM 实体：

| 实体 | 表名 | 关键字段 |
|------|------|----------|
| User | users | mindauth_id, username, email, role, avatar_url |
| Post | posts | user_id, category_id, server_id, post_type, title, content, content_html, status, is_pinned, view_count, like_count |
| Reply | replies | post_id, user_id, parent_reply_id, content, status |
| Category | categories | name, slug, sort_order |
| Tag | tags | name, slug |
| PostTag | post_tags | post_id, tag_id |
| Bookmark | bookmarks | user_id, post_id |
| Notification | notifications | user_id, type, actor_id, post_id, reply_id, is_read |
| Message | messages | sender_id, recipient_id, content, is_read |
| Attachment | attachments | post_id, user_id, file_path, file_size |
| Resource | resources | user_id, title, resource_type, file_path, external_url, version, status |
| ResourceCategory | resource_categories | name, slug |
| ResourceVersion | resource_versions | resource_id, version, file_path |
| PostLike | post_likes | user_id, post_id |
| ReplyLike | reply_likes | user_id, reply_id |
| Ban | bans | ban_type, value, reason, is_active, created_by |
| Setting | settings | key, value, category |
| OperationLog | operation_logs | user_id, action, target_type, target_id, details |
| SessionAudit | session_audit | user_id, session_token, action, ip_address |

### Post Entity 示例

```typescript
@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ nullable: true })
  category_id: number | null;

  @Column({ nullable: true })
  server_id: number | null;

  @Column({ length: 50, default: 'normal' })
  post_type: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string;

  @Column({ length: 50, default: 'draft' })
  status: string;

  @Column({ default: 0 })
  is_pinned: number;

  @CreateDateColumn()
  created_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;  // Soft Delete

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Reply, (reply) => reply.post)
  replies: Reply[];

  @OneToMany(() => PostTag, (pt) => pt.post)
  postTags: PostTag[];
}
```

---

## 安全架构

### 角色层级

```typescript
export const ROLES = {
  guest: 0,
  user: 1,
  moderator: 2,
  admin: 3,
} as const;
```

### 权限节点

```typescript
export const PERMISSIONS: Record<string, RoleName[]> = {
  POST_EDIT_ANY: ['moderator', 'admin'],
  POST_DELETE_ANY: ['moderator', 'admin'],
  POST_APPROVE: ['moderator', 'admin'],
  BAN_MANAGE: ['admin'],
  SETTINGS_MANAGE: ['admin'],
  USER_MANAGE: ['admin'],
  CATEGORY_MANAGE: ['admin'],
  TAG_MANAGE: ['admin'],
  RESOURCE_MODERATE: ['moderator', 'admin'],
};
```

### 状态常量

```typescript
export const POST_STATUS = { draft, pending, published, deleted };
export const REPLY_STATUS = { active, pending, deleted };
export const LOG_ACTIONS = {
  USER_LOGIN, USER_LOGOUT, POST_CREATE, POST_DELETE,
  POST_APPROVE, POST_PIN, REPLY_CREATE, BAN_CREATE,
  CATEGORY_CREATE, TAG_MERGE, RESOURCE_APPROVE, ...
};
```

---

## 性能优化

### 缓存策略

| 数据类型 | Redis Key | TTL | 策略 |
|----------|-----------|-----|------|
| Session | `session:${token}` | 7天 | Hash + 滑动窗口刷新 |
| 帖子详情 | `post:${id}` | 5分钟 | STRING JSON |
| 未读通知数 | `unread:${userId}` | 5分钟 | STRING |
| 视图计数限流 | `post_view:${id}` | 60秒 | STRING |
| 封禁列表 | 内存 Map | 10秒 | 内存缓存（频繁访问） |
| 系统设置 | 内存 Map | 5分钟 | 内存缓存（SettingsService） |

### 分页模式

**Page-Based Pagination**（传统分页）:
```typescript
const [data, total] = await repository.findAndCount({
  skip: (page - 1) * limit,
  take: limit,
});
return { data, total, page, totalPages };
```

**Cursor-Based Pagination**（无限滚动）:
```typescript
// encodeCursor(timestamp, id) → base64url
// decodeCursor(cursor) → [timestamp, id]
const posts = await repository.find({
  where: { created_at: LessThan(cursorTimestamp), id: LessThan(cursorId) },
  take: limit + 1,
});
const hasMore = posts.length > limit;
if (hasMore) posts.pop();
return { data, nextCursor, hasMore };
```

### Soft Delete

使用 TypeORM `@DeleteDateColumn`：
```typescript
@DeleteDateColumn()
deleted_at: Date;

// Soft delete
await repository.softDelete(id);

// Query 自动过滤已删除
await repository.find(); // 不包含 deleted_at != null
```

---

## 集成点

### MindAuth OAuth 集成

**流程**:
```
1. 前端 → MindAuth /login
2. MindAuth → 回调 /api/auth/callback?code=XYZ
3. AuthService.exchangeCode(code) → access_token
4. AuthService.getUserInfo(token) → MindAuth user
5. AuthService.getOrCreateUser() → 本地 User
6. AuthService.createSession() → Redis session:${token}
7. 响应 → Set-Cookie: forum_session=${token}
```

**AuthService 关键方法**:
- `exchangeCode(code)` → POST MindAuth /oauth/token
- `getUserInfo(accessToken)` → GET MindAuth /api/user
- `getOrCreateUser(mindauthUser)` → 查找/创建本地用户
- `createSession(userId, token, ip)` → Redis Hash + SessionAudit 记录
- `verifySession(token)` → Redis 验证 + 滑动窗口刷新
- `logout(token, userId)` → Redis删除 + SessionAudit 记录

### EasyManager 回调集成

**AutoPostModule**:
- 接收 `POST /api/auto-post/server-approved`
- `ServiceAuthGuard` 验证 X-Service-Key
- `createServerAnnouncement(data)` → 创建帖子 + 通知申请人

```typescript
async createServerAnnouncement(data: {
  server_name: string;
  server_id: number;
  description: string;
  user_id?: number;
}) {
  // 幂等检查：已存在相同 server_id 的公告
  const existing = await this.postRepo.findOne({
    where: { server_id: data.server_id, post_type: 'server_announcement' },
  });
  if (existing) return { post: existing, created: false };

  // 创建公告帖子
  const post = this.postRepo.create({
    user_id: 1, // System user
    post_type: 'server_announcement',
    title: `Server Approved: ${data.server_name}`,
    content: `## 🎉 ${data.server_name}\n\n${data.description}`,
    status: 'published',
  });
  await this.postRepo.save(post);

  // 通知申请人
  if (data.user_id) {
    await this.notificationRepo.save({
      user_id: data.user_id,
      type: 'server_approved',
      post_id: post.id,
    });
  }

  return { post, created: true };
}
```

---

## API 端点汇总

### Posts (`/api/posts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | 帖子列表（分页） |
| GET | `/cursor` | 帖子列表（Cursor分页） |
| GET | `/trending` | 热门帖子 |
| GET | `/pinned` | 置顶帖子 |
| GET | `/search` | 搜索帖子 |
| GET | `/:id` | 帖子详情+回复 |
| POST | `/` | 创建帖子 |
| PUT | `/:id` | 更新帖子 |
| DELETE | `/:id` | 软删除帖子 |
| PUT | `/:id/pin` | 置顶/取消置顶 |
| PUT | `/:id/move` | 移动分类 |

### Admin (`/api/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Dashboard统计 |
| GET | `/badge-counts` | 审核徽章计数 |
| GET | `/posts` | 帖子管理列表 |
| POST | `/posts/bulk-delete` | 批量删除 |
| PUT | `/posts/bulk-pin` | 批量置顶 |
| PUT | `/posts/bulk-move` | 批量移动 |
| GET | `/moderation` | 审核队列 |
| PUT | `/posts/:id/approve` | 批准帖子 |
| PUT | `/posts/:id/reject` | 拒绝帖子 |
| PUT | `/tags/merge` | 合并标签 |
| POST | `/cleanup/logs` | 清理日志 |
| POST | `/cleanup/soft-deleted` | 清理软删除 |

### Auth (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/callback` | OAuth回调 |
| POST | `/logout` | 登出 |
| GET | `/me` | 当前用户信息 |

### Resources (`/api/v1/resources`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | 资源列表（Cursor分页） |
| GET | `/:id` | 资源详情 |
| GET | `/:id/versions` | 资源版本列表 |
| GET | `/:id/download` | 下载资源 |
| POST | `/` | 创建资源 |
| PUT | `/:id` | 更新资源 |
| DELETE | `/:id` | 删除资源 |
| PUT | `/:id/status` | 更新状态（审核） |

---

## 模块依赖关系

```
AppModule
├── ConfigModule.forRoot (全局)
├── DatabaseModule (全局)
│   ├── TypeOrmModule.forRootAsync
│   └── RedisModule
│       └── RedisService
│
├── ServeStaticModule (4个静态目录)
│
├── AuthModule
│   ├── imports: TypeOrmModule.forFeature([User, SessionAudit])
│   ├── exports: AuthService
│   └── JwtAuthGuard依赖
│
├── PostsModule
│   ├── imports: TypeOrmModule.forFeature([Post, User, Category, Tag, PostTag, Reply])
│   └── RedisService注入
│
├── AdminModule
│   ├── imports: TypeOrmModule.forFeature([Post, Reply, User, Category, Tag, PostTag, Ban, Setting, OperationLog])
│   ├── StatsService, SettingsService, LogsService, BansService注入
│
├── NotificationsModule
│   ├── imports: TypeOrmModule.forFeature([Notification, User, Post, Reply])
│   ├── RedisService注入
│   ├── EmailService, EmailQueueService
│
├── BansModule
│   ├── imports: TypeOrmModule.forFeature([Ban, User])
│   ├── exports: BansService (供 BanGuard)
│
├── ResourcesModule
│   ├── imports: TypeOrmModule.forFeature([Resource, User, ResourceCategory, ResourceVersion])
│
├── ... 其他17个模块
```

---

## 总结

MindFourm 后端采用 NestJS v10 架构，具有以下特点：

1. **模块化设计** - 21个功能模块，按业务域划分
2. **TypeORM 实体** - 19个实体，支持 Soft Delete 和关系映射
3. **Redis 缓存** - Session、帖子、通知计数等多层次缓存
4. **Cursor 分页** - 无限滚动场景的高效分页方案
5. **Guard 层级** - 认证、角色、权限、封禁、限流多层守卫
6. **Lua 限流** - 嵌入式脚本实现原子性限流
7. **Markdown 处理** - marked + sanitize-html 安全渲染
8. **事务管理** - DataSource.transaction 保证数据一致性
9. **OAuth 集成** - MindAuth SSO + Redis Session 管理
10. **服务回调** - EasyManager 自动发帖回调支持

---
*Last updated: 2026-06-08*