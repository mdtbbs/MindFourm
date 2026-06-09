# 性能优化设计

> 本文档记录了论坛系统的性能优化方案。
> 创建时间: 2026-06-07

## 优化架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        性能优化                                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Redis    │  │ DB       │  │ API      │  │ 前端         │   │
│  │ 缓存层级 │  │ 索引优化 │  │ 响应优化 │  │ 渲染优化     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Redis 缓存层级

### 缓存策略（手动管理，非拦截器）

缓存通过 `RedisService` 手动管理，而非 NestJS CacheInterceptor：

| 数据类型 | 缓存时间 | 缓存 Key | 更新策略 |
|----------|----------|----------|----------|
| 用户会话 | 7 天 | `session:{token}` | 活动时滑动续期 |
| 用户资料 | 5 分钟 | `user:{id}` | 用户更新时删除 |
| 用户权限 | 5 分钟 | `user:permissions:{id}` | 角色变更时删除 |
| 帖子详情 | 5 分钟 | `post:{id}` | 帖子更新时删除 |
| 帖子列表（首页） | 1 分钟 | `posts:home:{page}` | 新帖子时删除 |
| 分类列表 | 30 分钟 | `categories:list` | 分类变更时删除 |
| 热门标签 | 5 分钟 | `tags:hot` | 定时更新 |
| 热门帖子 | 5 分钟 | `posts:hot` | 定时更新 |
| 系统设置 | 5 分钟 | `setting:{key}` | 设置更新时删除 |
| 帖子浏览量 | 1 分钟/IP 限制 | `view:post:{postId}:ip:{ip}` | 防刷量机制 |
| 未读通知数 | 5 分钟 | `user:unread:{id}` | 新通知/已读时更新 |
| 封禁检查 | 10 秒 | 内存 Map | 快速检查，非 Redis |

### 会话缓存策略

```typescript
// 7 天 TTL，滑动续期
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 天

// 用户活跃时续期会话
async function renewSession(token: string) {
  const session = await redis.get(`session:${token}`);
  if (session) {
    await redis.expire(`session:${token}`, SESSION_TTL);
  }
}
```

### 浏览量防刷机制

```typescript
// 使用 Redis 限制同一 IP 对同一帖子的浏览量计数频率
// 一个 IP 对一个帖子，每分钟只能增加一次浏览量

async function incrementViewCount(postId: number, ip: string) {
  const key = `view:post:${postId}:ip:${ip}`;
  const exists = await redis.exists(key);
  
  if (!exists) {
    // 增加浏览量
    await db.query('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [postId]);
    // 设置 1 分钟 TTL
    await redis.set(key, '1', 'EX', 60);
  }
}
```

### 封禁检查缓存

```typescript
// 使用内存 Map（非 Redis）进行快速封禁检查
// 10 秒 TTL，避免频繁数据库查询

const banCache = new Map<string, { banned: boolean; expireAt: number }>();

async function checkBan(userId: number): Promise<boolean> {
  const key = `user:${userId}`;
  const cached = banCache.get(key);
  
  if (cached && cached.expireAt > Date.now()) {
    return cached.banned;
  }
  
  // 查询数据库
  const banned = await db.query('SELECT * FROM bans WHERE user_id = ? AND active = 1', [userId]);
  
  banCache.set(key, {
    banned: banned.length > 0,
    expireAt: Date.now() + 10000, // 10 秒
  });
  
  return banned.length > 0;
}
```

### 未读通知数缓存

```typescript
// 5 分钟 TTL，新通知时主动更新
const UNREAD_TTL = 5 * 60; // 5 分钟

async function getUnreadCount(userId: number): Promise<number> {
  const key = `user:unread:${userId}`;
  const cached = await redis.get(key);
  
  if (cached) {
    return parseInt(cached);
  }
  
  // 查询数据库
  const count = await db.query('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  
  await redis.set(key, count.toString(), 'EX', UNREAD_TTL);
  
  return count;
}

// 新通知时更新缓存
async function createNotification(userId: number, notification: Notification) {
  await db.insertNotification(notification);
  
  // 主动更新未读数缓存
  const key = `user:unread:${userId}`;
  const current = await redis.get(key);
  if (current) {
    await redis.set(key, (parseInt(current) + 1).toString(), 'EX', UNREAD_TTL);
  }
}
```

### 缓存失效处理
```typescript
// 在 Service 中手动删除相关缓存
async updatePost(id: number, dto: UpdatePostDto, userId: number): Promise<Post> {
  // 更新帖子
  const post = await this.postRepo.update(id, dto);

  // 删除相关缓存
  await this.redis.del([
    `post:${id}`,
    `posts:home:1`,          // 首页缓存
    `posts:hot`,              // 热门帖子
  ]);

  return post;
}
```

---

## 数据库索引优化

### 必需索引
```sql
-- 帖子表
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_status_created ON posts(status, created_at DESC);
CREATE INDEX idx_posts_is_pinned ON posts(is_pinned, created_at DESC);
CREATE INDEX idx_posts_is_featured ON posts(is_featured, created_at DESC);
CREATE INDEX idx_posts_visibility ON posts(visibility, created_at DESC);

-- 回复表
CREATE INDEX idx_replies_post_id ON replies(post_id);
CREATE INDEX idx_replies_user_id ON replies(user_id);
CREATE INDEX idx_replies_parent ON replies(post_id, parent_reply_id);
CREATE INDEX idx_replies_created ON replies(post_id, created_at DESC);

-- 通知表
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- 举报表
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_reporter ON reports(reporter_id);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);

-- 用户表
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_mindauth ON users(mindauth_id);
CREATE INDEX idx_users_online ON users(is_online, last_active_at);

-- 点赞/收藏
CREATE INDEX idx_likes_user_post ON likes(user_id, post_id);
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id, created_at DESC);

-- 私信
CREATE INDEX idx_messages_group ON group_messages(group_id, created_at DESC);
CREATE INDEX idx_message_reads_user ON message_reads(user_id);

-- 关注
CREATE INDEX idx_follows_follower ON user_follows(follower_id);
CREATE INDEX idx_follows_following ON user_follows(following_id);
```

### 查询优化示例

#### 优化前（全表扫描）
```sql
-- 慢查询：没有索引
SELECT * FROM posts WHERE status = 'published' ORDER BY created_at DESC LIMIT 20;
```

#### 优化后（使用索引）
```sql
-- 使用复合索引 idx_posts_status_created
SELECT id, title, user_id, category_id, created_at 
FROM posts 
WHERE status = 'published' 
ORDER BY created_at DESC 
LIMIT 20;
```

### 避免的查询模式
| 模式 | 问题 | 解决方案 |
|------|------|----------|
| `SELECT *` | 获取不需要的列 | 明确指定需要的列 |
| `LIKE '%keyword%'` | 无法使用索引 | 使用全文索引或 Elasticsearch |
| N+1 查询 | 循环查询关联数据 | 使用 JOIN 或批量查询 |
| 大分页 `LIMIT 10000, 20` | 扫描大量数据 | 使用 Cursor-based 分页 |

### Cursor-based 分页

游标分页比 OFFSET 分页更高效，特别是大数据量时：

```typescript
// 使用游标分页（比 OFFSET 更高效）
async getPostsWithCursor(options: CursorPagination): Promise<CursorResult> {
  const qb = this.postRepo
    .createQueryBuilder('p')
    .where('p.status = :status', { status: 'published' })
    .orderBy('p.created_at', 'DESC')
    .limit(options.limit + 1); // 多取一条判断是否有下一页

  if (options.cursor) {
    qb.andWhere('p.created_at < :cursor', { cursor: options.cursor });
  }

  const posts = await qb.getMany();
  
  // 正确的处理方式：先判断，再弹出
  const hasNextPage = posts.length > options.limit;
  if (hasNextPage) {
    posts.pop(); // 移除多取的那条
  }

  return {
    data: posts,
    hasNextPage,
    nextCursor: hasNextPage ? posts[posts.length - 1].created_at : null,
  };
}
```

> **注意**：代码正确地在 `pop()` 之前先判断 `hasNextPage`。错误的写法是先 `pop()` 再判断，这会导致边界情况出错。

### Offset 分页

对于小数据量或需要显示总页数的情况，使用传统的 offset 分页：

```typescript
async getPostsWithOffset(options: OffsetPagination): Promise<OffsetResult> {
  const qb = this.postRepo
    .createQueryBuilder('p')
    .where('p.status = :status', { status: 'published' })
    .orderBy('p.created_at', 'DESC')
    .skip((options.page - 1) * options.limit)
    .take(options.limit);

  const [data, total] = await qb.getManyAndCount();

  return {
    data,
    total,
    page: options.page,
    limit: options.limit,
    totalPages: Math.ceil(total / options.limit),
  };
}
```

---

## API 响应优化

### 压缩
```typescript
// 启用 gzip 压缩
app.use(compression({
  threshold: 1024, // 大于 1KB 的响应才压缩
}));
```

### 响应头优化
```typescript
// Cache-Control 设置
// 静态资源：1 年缓存
app.use('/static', express.static('public', {
  maxAge: 365 * 24 * 60 * 60 * 1000,
  immutable: true,
}));

// API 响应：不缓存（或使用 ETag）
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});
```

### 字段选择
```typescript
// 允许客户端指定需要的字段
// GET /api/posts?fields=id,title,author.username,created_at

@Query('fields') fields?: string,

const selectFields = fields ? fields.split(',').map(f => f.trim()) : undefined;
const qb = this.postRepo.createQueryBuilder('p');
if (selectFields) {
  qb.select(selectFields.map(f => `p.${f}`));
}
```

---

## 前端渲染优化

### SSR（服务端渲染）
- Next.js 默认使用 SSR，首屏直接在服务端渲染 HTML
- 减少客户端 JavaScript 加载时间

### SSG（静态生成）
对于不常变化的页面使用 SSG：
- 帖子详情页：ISR（增量静态再生），每 60 秒重新生成
- 分类页面：每次有新帖子时重新生成

```typescript
// Next.js ISR 配置
export const revalidate = 60; // 每 60 秒重新验证

// 或者按需重新验证
export async function revalidatePost(postId: number) {
  await revalidate(`/posts/${postId}`);
}
```

### 图片优化
```tsx
// Next.js Image 组件（自动优化）
import Image from 'next/image';

<Image
  src={user.avatar_url}
  alt={user.username}
  width={40}
  height={40}
  loading="lazy"           // 懒加载
  placeholder="blur"       // 模糊占位
  blurDataURL={blurHash}   // 模糊图
/>
```

### 组件懒加载
```tsx
// 动态导入不常用的组件
const Editor = dynamic(() => import('@/components/editor'), {
  loading: () => <Shimmer height={400} />,
  ssr: false, // 不需要服务端渲染
});

// 条件加载
if (showEditor) {
  return <Editor />;
}
```

### 数据预取
```typescript
// 在用户悬停链接时预取数据
function PrefetchLink({ href, children }) {
  const queryClient = useQueryClient();

  return (
    <Link
      href={href}
      onMouseEnter={() => {
        // 预取链接对应的数据
        queryClient.prefetchQuery(['post', href.split('/').pop()], () =>
          fetchPost(href.split('/').pop())
        );
      }}
    >
      {children}
    </Link>
  );
}
```

---

## 频率限制

### Lua 脚本原子操作

使用 Lua 脚本实现原子性的 INCR + EXPIRE 操作，避免竞态条件：

```typescript
// Lua 脚本：原子性计数 + 设置过期时间
const RATE_LIMIT_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

async function checkRateLimit(key: string, limit: number, ttl: number): Promise<boolean> {
  const current = await redis.eval(RATE_LIMIT_SCRIPT, [key], [ttl.toString()]);
  return current <= limit;
}

// 使用示例
async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip;
  const key = `rate_limit:${ip}:${req.path}`;
  
  const allowed = await checkRateLimit(key, 100, 60); // 每 IP 每路径每分钟 100 次
  
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  next();
}
```

> **注意**：Lua 脚本在 Redis 服务器端执行，保证 INCR 和 EXPIRE 的原子性。如果分开调用，可能导致计数后未设置过期时间（进程崩溃时）。

---

## 数据库连接池优化

```typescript
// TypeORM 配置
{
  type: 'mysql',
  host: process.env.MYSQL_HOST,
  port: 3306,
  username: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  // 连接池配置
  extra: {
    connectionLimit: 20,        // 最大连接数
    waitForConnections: true,   // 连接池满时等待
    queueLimit: 0,              // 等待队列限制（0=无限）
    connectTimeout: 10000,      // 连接超时 10s
  },
}
```

---

## 性能基准目标

| 指标 | 目标 |
|------|------|
| 首屏加载（LCP） | < 2.5s |
| 交互准备（TTI） | < 3.5s |
| API 响应时间（P50） | < 200ms |
| API 响应时间（P95） | < 1s |
| 数据库查询时间 | < 50ms |
| Redis 命中率 | > 80% |
| 并发用户支持 | > 1000 |

---

## 索引优化补充

### 移除未实现表的索引

以下索引对应未实现的功能，已移除：
- `idx_follows_follower` - 关注系统未实现
- `idx_follows_following` - 关注系统未实现
- `idx_message_reads_user` - 群聊未实现

### 私信索引调整

```sql
-- 一对一私信索引（非群聊）
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_unread ON messages(recipient_id, is_read);
```
