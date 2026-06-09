# 安全设计

> 本文档记录了论坛系统的安全设计方案。
> 创建时间: 2026-06-07
> 最后更新: 2026-06-08

## 安全架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        安全防护层                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Rate     │  │ XSS/CSP  │  │ Captcha  │  │ Bot Detection │   │
│  │ Limiting │  │ Protection│ │          │  │ & IP Block    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                       应用安全层                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Auth     │  │ Roles    │  │ Content  │  │ SQL Injection │   │
│  │ JWT/Redis│  │ Guard    │  │ Filter   │  │ Prevention    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                       数据安全层                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ Password │  │ Session  │  │ Data     │                      │
│  │ Hashing  │  │ Security │  │ Encryption│                     │
│  └──────────┘  └──────────┘  └────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. 身份认证安全

### JWT 会话存储

论坛系统使用 Redis 存储 JWT 会话，而非无状态 JWT Token：

| 配置项 | 值 |
|--------|-----|
| 会话存储 | Redis (`session:{token}`) |
| Cookie 名称 | `forum_session` |
| Cookie 属性 | `HttpOnly`, `Secure` (生产环境), `SameSite=Lax` |

### 认证守卫实现

```typescript
// common/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const sessionToken = request.cookies?.forum_session || 
                         this.extractTokenFromHeader(request);

    if (!sessionToken) {
      throw new UnauthorizedException('未登录');
    }

    const user = await this.authService.verifySession(sessionToken);
    if (!user) {
      throw new UnauthorizedException('会话已过期');
    }

    request.user = user;
    return true;
  }
}
```

### 会话验证流程

1. 从 Cookie 或 Authorization Header 提取 session token
2. 在 Redis 中查找 session 数据
3. 验证 session 是否有效且未过期
4. 将用户信息附加到 request.user

---

## 2. 授权安全

### 角色层级系统

```typescript
// common/utils/constants.ts
export const ROLES = {
  user: 1,
  active_user: 2,
  core_user: 3,
  moderator: 4,
  admin: 5,
  super_admin: 6,
} as const;
```

### 角色守卫实现

```typescript
// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    const userRoleLevel = ROLES[user.role as RoleName] ?? 0;
    const hasRequiredRole = requiredRoles.some(
      (role) => userRoleLevel >= ROLES[role]
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }
}
```

### 使用方式

```typescript
@Roles('moderator', 'admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Delete(':id')
async deletePost() { ... }
```

---

## 3. Rate Limiting（频率限制）

### 原子性 Lua 脚本实现

使用 Redis Lua 脚本确保 INCR 和 EXPIRE 操作的原子性，消除竞态条件：

```typescript
// common/guards/rate-limit.guard.ts
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

@Injectable()
export class RateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const handlerName = context.getHandler().name;

    const limitConfig = DEFAULT_LIMITS[handlerName] || { max: 60, window: 60 };
    const key = `rate_limit:${ip}:${handlerName}`;

    // 原子性执行: INCR + 条件 EXPIRE
    const current = await this.redis.eval(
      this.rateLimitScript,
      [key],
      [limitConfig.window.toString()],
    );

    if (current > limitConfig.max) {
      throw new HttpException(
        '请求过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
```

### 频率限制规则

| 操作 | 限制 | 窗口 |
|------|------|------|
| 发帖 (handleCreate) | 10 次 | 60 秒 |
| 回复 (handleReply) | 30 次 | 60 秒 |
| 登录 (handleLogin) | 5 次 | 300 秒 |
| 会话验证 (handleVerifySession) | 20 次 | 60 秒 |
| 默认 API 请求 | 60 次 | 60 秒 |

---

## 4. XSS 防护

### 策略
- 所有用户输入在后端进行 HTML 转义后存储
- 帖子正文使用 Markdown → HTML 转换（允许安全标签）
- 前端使用 React（天然防止 XSS），不直接使用 `dangerouslySetInnerHTML`
- 需要 HTML 的地方使用 DOMPurify 过滤

### 允许的安全标签（帖子正文）
```
h1-h6, p, br, strong, em, u, s, code, pre, blockquote,
ul, ol, li, a, img, table, thead, tbody, tr, th, td,
hr, details, summary
```

### 禁止的内容
```
<script>, <iframe>, <object>, <embed>, <form>,
on* 事件属性（onclick, onload 等）,
javascript: URL 协议
```

### 实现
```typescript
// common/utils/sanitize.util.ts
import sanitizeHtml from 'sanitize-html';

export function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['h1','h2','h3','h4','h5','h6','p','br','strong','em',
                  'u','s','code','pre','blockquote','ul','ol','li','a',
                  'img','table','thead','tbody','tr','th','td','hr'],
    allowedAttributes: {
      'a': ['href', 'title', 'target', 'rel'],
      'img': ['src', 'alt', 'title'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ['href', 'src'],
  });
}
```

---

## 5. CORS 与 CSRF 策略

### CORS 配置

```typescript
// main.ts
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
});
```

### CSRF 决策说明

**当前方案：依赖 CORS Origin 验证，未实现 Double Submit Cookie**

**理由：**

1. **HttpOnly Cookie + 同源前端**：前端 (localhost:3000) 和后端 (localhost:4000) 为同源策略下的可信配置，Cookie 设置为 HttpOnly，JavaScript 无法读取

2. **CORS 限制**：CORS 配置只允许 `FRONTEND_URL` 源，其他域的请求会被浏览器拒绝

3. **无第三方 Cookie 共享**：API 不依赖第三方 Cookie 进行身份验证，CSRF 攻击面有限

4. **Samesite Cookie**：生产环境建议设置 `SameSite=Lax` 或 `SameSite=Strict`

**风险控制：**
- 开发环境：localhost 之间通信，风险可控
- 生产环境：确保 `FRONTEND_URL` 配置正确，使用 HTTPS

**后续改进建议：**
- 如需支持第三方嵌入，应实现 Double Submit Cookie
- 考虑添加 Origin header 校验作为额外防护层

---

## 6. Content-Security-Policy（CSP）

### 推荐配置

对于生产环境，建议添加以下 CSP Header：

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';
```

### 配置说明

| 指令 | 值 | 说明 |
|------|-----|------|
| `default-src` | `'self'` | 默认只允许同源资源 |
| `script-src` | `'self' 'unsafe-inline'` | 允许同源脚本和内联脚本（开发模式需要） |
| `style-src` | `'self' 'unsafe-inline'` | 允许同源样式和内联样式（Tailwind 需要） |
| `img-src` | `'self' data: https:` | 允许同源图片、data URI 和 HTTPS 图片 |
| `font-src` | `'self' data:` | 允许同源字体和 data URI |
| `connect-src` | `'self'` | API 请求只允许同源 |
| `frame-ancestors` | `'none'` | 禁止被 iframe 嵌入 |

### NestJS 实现（推荐）

```typescript
// main.ts
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // ...
}
```

---

## 7. IP 黑名单与封禁系统

### 封禁类型

| 类型 | 说明 |
|------|------|
| `user` | 用户 ID 封禁 |
| `ip` | 单个 IP 封禁 |
| `ip_range` | IP 范围封禁（CIDR） |

### 封禁守卫实现

```typescript
// common/guards/ban.guard.ts
@Injectable()
export class BanGuard implements CanActivate {
  constructor(private banService: BansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.connection?.remoteAddress;
    const user = req.user;

    // 检查 IP 封禁
    if (ip && await this.banService.checkIp(ip)) {
      throw new ForbiddenException('Your IP has been blocked');
    }

    // 检查用户封禁
    if (user && await this.banService.isActive('user', user.id)) {
      throw new ForbiddenException('您的账号已被封禁');
    }

    return true;
  }
}
```

### CIDR 匹配实现

```typescript
// modules/bans/bans.service.ts
async checkIp(ip: string): Promise<boolean> {
  // 检查精确 IP 匹配
  if (this.banCache.has(`ip:${ip}`)) {
    return true;
  }

  // 检查 CIDR 范围匹配
  for (const [key, entry] of this.banCache.entries()) {
    if (entry.ban_type === 'ip_range' && key.startsWith('ip_range:')) {
      if (this.ipInRange(ip, entry.value)) {
        return true;
      }
    }
  }

  return false;
}

// IPv4 CIDR 匹配
ipInRange(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
  return (this.ipToNum(ip) & mask) === (this.ipToNum(range) & mask);
}
```

### IPv6 支持规划

**当前状态：仅支持 IPv4 CIDR**

**后续改进建议：**
- 添加 IPv6 CIDR 匹配支持
- 使用 `ipaddr.js` 或类似库处理 IPv6 地址
- 数据库字段扩展以存储 IPv6 地址

```typescript
// 建议的 IPv6 支持
import * as ipaddr from 'ipaddr.js';

ipInRangeV6(ip: string, cidr: string): boolean {
  const addr = ipaddr.parse(ip);
  const range = ipaddr.parseCIDR(cidr);
  return addr.match(range);
}
```

### 封禁缓存

为提高性能，封禁列表缓存 10 秒：

```typescript
private readonly CACHE_TTL = 10000; // 10 秒

private maybeRefreshCache(): void {
  const now = Date.now();
  if (now > this.cacheExpiry) {
    this.refreshBanCache();
  }
}
```

---

## 8. 服务间认证

### 守卫实现

```typescript
// common/guards/service-auth.guard.ts
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceKey = request.headers['x-service-key'];
    const expectedKey = this.config.get<string>('easymanager.apiKey');

    if (!serviceKey || serviceKey !== expectedKey) {
      throw new ForbiddenException('Unauthorized service');
    }

    return true;
  }
}
```

### 使用场景

- EasyManager 回调 MindFourm 的 `/api/auto-post/server-approved`
- 服务间 API 调用

---

## 9. 错误处理安全

### 全局异常过滤器

```typescript
// common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || exception.message;

      response.status(status).json({
        success: false,
        message,
      });
      return;
    }

    // 未处理异常 - 隐藏内部错误详情
    console.error('Unhandled exception:', exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '服务器内部错误',
    });
  }
}
```

### 安全措施

- 未处理异常不暴露堆栈信息
- 返回通用错误消息
- 详细错误记录到服务器日志

---

## 10. 数据保护

### 软删除

敏感数据（帖子、回复）使用软删除而非物理删除：

```typescript
@Delete(':id')
async deletePost(@Param('id') id: number) {
  await this.postService.softDelete(id);
}
```

### 会话审计

- 登录/登出记录到 `operation_logs` 表
- 异常登录检测（异地 IP、异常时间）

---

## 11. 安全审计

### 操作日志

所有敏感操作记录到 `operation_logs` 表：

| 操作类型 | 说明 |
|----------|------|
| 登录/登出 | 用户认证事件 |
| 密码修改 | 通过 MindAuth |
| 角色变更 | 管理员操作 |
| 封禁/解封 | 管理员操作 |
| 帖子删除 | 内容管理 |
| 设置修改 | 系统配置变更 |

### 定期安全检查

- 每月审查频率限制配置
- 每季度审查 IP 黑名单
- 持续监控异常流量

---

## 12. 验证与输入过滤

### class-validator 验证

```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // 剥离未定义属性
    forbidNonWhitelisted: true, // 拒绝未定义属性
    transform: true,           // 自动转换类型
    transformOptions: { enableImplicitConversion: true },
  }),
);
```

### DTO 验证示例

```typescript
export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  content!: string;

  @IsInt()
  @IsOptional()
  categoryId?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
```

---

## 附录：安全检查清单

- [x] JWT 会话存储在 Redis，使用 HttpOnly Cookie
- [x] 角色层级守卫控制 API 访问
- [x] Rate Limiting 使用原子性 Lua 脚本
- [x] XSS 防护：React + sanitize-html
- [x] CORS 配置限制可信源
- [ ] CSP Header（待实现）
- [x] IP 封禁支持 CIDR（仅 IPv4）
- [x] 服务间认证使用 X-Service-Key
- [x] 错误处理不暴露内部信息
- [x] 软删除保护数据
- [x] class-validator 输入验证