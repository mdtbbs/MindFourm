# MindAuth 认证集成设计

> 本文档记录了论坛系统与 MindAuth OAuth 的集成设计方案。
> 创建时间: 2026-06-07
> 更新时间: 2026-06-08

## 认证流程

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  用户    │    │  论坛    │    │ MindAuth │    │  论坛    │    │  Redis   │
│  浏览器  │    │  前端    │    │          │    │  后端    │    │          │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │               │
     │ 1. 访问论坛   │               │               │               │
     │──────────────▶│               │               │               │
     │               │               │               │               │
     │ 2. 检测未登录 │               │               │               │
     │               │               │               │               │
     │ 3. 跳转登录   │               │               │               │
     │◀──────────────│               │               │               │
     │               │               │               │               │
     │ 4. MindAuth 登录               │               │               │
     │───────────────────────────────▶│               │               │
     │               │               │               │               │
     │ 5. 返回 code  │               │               │               │
     │◀──────────────────────────────│               │               │
     │               │               │               │               │
     │ 6. 回调 /api/auth/callback    │               │               │
     │──────────────▶│               │               │               │
     │               │               │               │               │
     │               │ 7. POST /oauth/token          │               │
     │               │──────────────────────────────▶│               │
     │               │               │               │               │
     │               │ 8. 返回 access_token          │               │
     │               │◀──────────────────────────────│               │
     │               │               │               │               │
     │               │ 9. GET /api/user              │               │
     │               │──────────────────────────────▶│               │
     │               │               │               │               │
     │               │ 10. 返回用户信息               │               │
     │               │◀──────────────────────────────│               │
     │               │               │               │               │
     │               │ 11. 创建/更新本地用户          │               │
     │               │──────────────────────────────▶│               │
     │               │               │               │               │
     │               │ 12. 创建 Redis 会话（7天TTL）  │               │
     │               │──────────────────────────────────────────────▶│
     │               │               │               │               │
     │               │ 13. 设置 HttpOnly Cookie（30天）              │
     │               │               │               │               │
     │ 14. 重定向到首页              │               │               │
     │◀──────────────│               │               │               │
     │               │               │               │               │
     │               │ 后续请求：验证会话 + 滑动续期   │               │
     │               │──────────────────────────────────────────────▶│
```

---

## 核心概念

### OAuth Token 的作用范围

**重要**：OAuth `access_token` 仅在登录时一次性使用，用于从 MindAuth 获取用户信息。它**不用于后续的 API 认证**。

| 阶段 | Token | 说明 |
|------|-------|------|
| 登录时 | OAuth `access_token` | 一次性使用，获取用户信息后丢弃 |
| 后续认证 | Redis 会话 Token | 存储在 HttpOnly Cookie 中，是主要认证机制 |

### 会话管理

| 机制 | TTL | 说明 |
|------|-----|------|
| Redis 会话 | 7 天（604800 秒） | 实际会话有效期，滑动窗口续期 |
| Cookie `maxAge` | 30 天 | Cookie 本身的最大存活时间 |
| 会话审计 | 永久 | 记录到 `session_audit` 表 |

**滑动窗口续期**：每次成功验证会话时，Redis 会话的 TTL 会重置为 7 天。这意味着活跃用户的会话实际上不会过期，只要他们在 7 天内至少访问一次。

---

## OAuth 配置

### 环境变量
```env
MINDAUTH_URL=http://localhost:4001
MINDAUTH_CLIENT_ID=forum
MINDAUTH_CLIENT_SECRET=<secret>
MINDAUTH_CALLBACK_URL=http://localhost:3000/api/auth/callback
```

### 注册 MindAuth 客户端
在 MindAuth 管理后台注册论坛应用：
- **客户端 ID**：`forum`
- **客户端密钥**：自动生成
- **回调 URL**：`http://localhost:3000/api/auth/callback`（开发）
- **权限范围**：`profile email`

---

## Cookie 配置

```typescript
// config/app.config.ts
export default () => ({
  session: {
    name: 'forum_session',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 天（Cookie 存活时间）
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});
```

**注意**：Cookie 的 `maxAge`（30 天）和 Redis 会话 TTL（7 天）不同是正常的设计。Cookie 存储的是会话 Token，而 Redis 决定会话是否有效。滑动窗口续期确保活跃用户的会话保持有效。

---

## 认证服务实现

```typescript
// modules/auth/auth.service.ts
@Injectable()
export class AuthService {
  // Redis 会话 TTL：7 天，每次验证时滑动续期
  private readonly sessionTtl = 7 * 24 * 60 * 60; // 604800 秒

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(SessionAudit) private sessionAuditRepo: Repository<SessionAudit>,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * OAuth 回调处理
   * 注意：OAuth access_token 仅在此处一次性使用，用于获取用户信息
   */
  async handleOAuthCallback(code: string, ip: string): Promise<AuthResult> {
    // 1. 用 code 换取 access_token（一次性使用）
    const accessToken = await this.exchangeCode(code);

    // 2. 获取用户信息（access_token 使用后丢弃）
    const mindauthUser = await this.getUserInfo(accessToken);

    // 3. 创建或更新本地用户
    const user = await this.getOrCreateUser(mindauthUser);

    // 4. 创建本地 Redis 会话（主要认证机制）
    const sessionToken = this.generateSessionToken();
    await this.createSession(user.id, sessionToken, ip);

    return { user, sessionToken };
  }

  /**
   * 验证会话 - 滑动窗口续期
   */
  async verifySession(sessionToken: string): Promise<User | null> {
    const sessionKey = `session:${sessionToken}`;
    const sessionData = await this.redisService.hgetall(sessionKey);

    if (!sessionData || !sessionData.userId) {
      return null;
    }

    // 滑动窗口：每次成功验证时刷新 TTL
    await this.redisService.expire(sessionKey, this.sessionTtl);

    const userId = parseInt(sessionData.userId, 10);
    const user = await this.userRepo.findOne({ where: { id: userId } });

    return user || null;
  }

  /**
   * 创建会话并记录审计日志
   */
  async createSession(userId: number, sessionToken: string, ip: string): Promise<void> {
    const sessionKey = `session:${sessionToken}`;

    // 存储会话到 Redis（哈希结构）
    await this.redisService.hset(sessionKey, 'userId', userId.toString());
    await this.redisService.hset(sessionKey, 'createdAt', new Date().toISOString());
    await this.redisService.expire(sessionKey, this.sessionTtl);

    // 记录审计日志
    const audit = this.sessionAuditRepo.create({
      user_id: userId,
      session_token: sessionToken,
      action: 'login',
      ip_address: ip,
    });
    await this.sessionAuditRepo.save(audit);
  }

  /**
   * 登出
   */
  async logout(sessionToken: string, userId?: number): Promise<void> {
    const sessionKey = `session:${sessionToken}`;
    await this.redisService.del(sessionKey);

    // 记录审计日志
    if (userId) {
      const audit = this.sessionAuditRepo.create({
        user_id: userId,
        session_token: sessionToken,
        action: 'logout',
      });
      await this.sessionAuditRepo.save(audit);
    }
  }

  /**
   * 撤销 MindAuth 令牌（可选）
   * @deprecated OAuth 令牌仅在登录时一次性使用，此方法仅用于清理目的。
   * 本地 Redis 会话是主要认证机制。
   */
  async revokeTokens(accessToken: string, refreshToken?: string): Promise<void> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    try {
      await axios.post(`${mindauthUrl}/api/revoke`, {
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } catch (error) {
      // 静默失败 - 本地会话已销毁
      console.warn('Failed to revoke tokens at MindAuth:', error.message);
    }
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }
}
```

---

## 认证守卫

```typescript
// common/guards/auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const sessionToken = req.cookies['forum_session'];

    if (!sessionToken) {
      throw new UnauthorizedException('未登录');
    }

    const user = await this.authService.verifySession(sessionToken);
    if (!user) {
      throw new UnauthorizedException('会话已过期');
    }

    req.user = user;
    return true;
  }
}
```

### @Public() 装饰器
```typescript
// common/decorators/public.decorator.ts
export const Public = () => SetMetadata('isPublic', true);

// 在守卫中检查
const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler());
if (isPublic) return true; // 跳过认证
```

---

## 会话管理策略

### 会话过期机制

| 场景 | 行为 |
|------|------|
| Redis 会话过期（7天无活动） | 需要重新登录 |
| 用户登出 | 立即删除会话，记录审计日志 |
| Cookie 过期（30天） | Cookie 被浏览器删除，但会话可能仍在 Redis 中 |
| 封禁用户 | 立即删除所有会话 |

### 滑动窗口续期

会话采用**滑动窗口续期**机制：
- Redis 会话 TTL 为 7 天
- 每次成功验证会话时，TTL 重置为 7 天
- 活跃用户的会话实际上永不过期（只要 7 天内至少访问一次）

### 会话审计

所有登录/登出操作记录到 `session_audit` 表：

```sql
CREATE TABLE session_audit (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  session_token VARCHAR(96) NOT NULL,
  action ENUM('login', 'logout') NOT NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC)
);
```

### 异常登录检测
| 检测项 | 规则 |
|--------|------|
| 异地登录 | IP 城市变化 |
| 异常时间 | 非活跃时段登录 |
| 频繁失败 | 15 分钟内登录失败 > 5 次 |
| 异常设备 | User-Agent 突然变化 |

---

## 前端认证集成

### 登录流程
```typescript
// lib/auth/context.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 检查当前是否有有效会话
    fetch('/api/auth/verify')
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  // MindAuth 登录跳转
  const login = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_MINDAUTH_URL}/login?client_id=forum&redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_CALLBACK_URL)}`;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

---

## 安全注意事项

1. **HttpOnly Cookie**：前端 JS 无法读取，防止 XSS 窃取会话 Token
2. **SameSite Cookie**：防止 CSRF 攻击
3. **HTTPS**：生产环境必须使用 HTTPS
4. **OAuth Token 一次性使用**：`access_token` 仅用于获取用户信息，不存储
5. **Redis 会话为主**：本地 Redis 会话是主要认证机制，不依赖 MindAuth Token
6. **滑动窗口续期**：活跃用户会话保持有效
7. **会话审计**：所有登录/登出操作记录到数据库
8. **MindAuth 依赖**：论坛不存储密码，所有密码相关操作通过 MindAuth
