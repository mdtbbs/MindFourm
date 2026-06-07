# MindAuth 认证集成设计

> 本文档记录了论坛系统与 MindAuth OAuth 的集成设计方案。
> 创建时间: 2026-06-07

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
     │               │ 12. 创建会话                   │               │
     │               │──────────────────────────────────────────────▶│
     │               │               │               │               │
     │               │ 13. 设置 HttpOnly Cookie      │               │
     │               │               │               │               │
     │ 14. 重定向到首页              │               │               │
     │◀──────────────│               │               │               │
```

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

## JWT 管理

### Token 类型
| Token | 有效期 | 存储位置 | 用途 |
|-------|--------|----------|------|
| 访问 Token（access_token） | 1 小时 | HttpOnly Cookie | API 请求认证 |
| 刷新 Token（refresh_token） | 7 天 | Redis | 刷新访问 Token |

### Cookie 配置
```typescript
// config/oauth.config.ts
export const authConfig = {
  cookieName: 'forum_session',
  cookieOptions: {
    httpOnly: true,       // 前端 JS 无法访问
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',      // CSRF 防护
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    path: '/',
  },
};
```

---

## 认证服务实现

```typescript
// modules/auth/auth.service.ts
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(RefreshToken) private refreshRepo: Repository<RefreshToken>,
    private httpService: HttpService,
    private redis: RedisService,
  ) {}

  /**
   * OAuth 回调处理
   */
  async handleOAuthCallback(code: string, ip: string, userAgent: string): Promise<AuthResult> {
    // 1. 用 code 换取 access_token
    const tokenResponse = await this.httpService.post(
      `${process.env.MINDAUTH_URL}/oauth/token`,
      {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.MINDAUTH_CLIENT_ID,
        client_secret: process.env.MINDAUTH_CLIENT_SECRET,
        redirect_uri: process.env.MINDAUTH_CALLBACK_URL,
      }
    ).toPromise();

    const { access_token, refresh_token } = tokenResponse.data;

    // 2. 获取用户信息
    const userInfo = await this.httpService.get(
      `${process.env.MINDAUTH_URL}/api/user`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    ).toPromise();

    const mindauthUser = userInfo.data;

    // 3. 创建或更新本地用户
    let user = await this.userRepo.findOne({ where: { mindauth_id: mindauthUser.id } });

    if (!user) {
      // 新用户
      user = this.userRepo.create({
        mindauth_id: mindauthUser.id,
        username: mindauthUser.username,
        email: mindauthUser.email,
        avatar_url: mindauthUser.avatar_url,
        status: 'active',
      });
      await this.userRepo.save(user);

      // 分配默认角色
      await this.assignDefaultRole(user.id);
    } else {
      // 更新用户信息
      user.username = mindauthUser.username;
      user.email = mindauthUser.email;
      if (mindauthUser.avatar_url) user.avatar_url = mindauthUser.avatar_url;
      await this.userRepo.save(user);
    }

    // 4. 创建本地会话
    const sessionToken = this.generateSessionToken();
    
    // 存储到 Redis
    await this.redis.set(
      `session:${sessionToken}`,
      JSON.stringify({ userId: user.id, ip, userAgent }),
      'EX', 7 * 24 * 60 * 60 // 7 天
    );

    // 记录登录日志
    await this.logLogin(user.id, ip, userAgent);

    return { user, sessionToken };
  }

  /**
   * 验证会话
   */
  async verifySession(sessionToken: string): Promise<User | null> {
    const sessionData = await this.redis.get(`session:${sessionToken}`);
    if (!sessionData) return null;

    const { userId } = JSON.parse(sessionData);
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user || user.status !== 'active') return null;

    // 更新最后活跃时间
    user.last_active_at = new Date();
    user.is_online = true;
    await this.userRepo.save(user);

    // 更新 Redis 会话
    await this.redis.expire(`session:${sessionToken}`, 7 * 24 * 60 * 60);

    return user;
  }

  /**
   * 登出
   */
  async logout(sessionToken: string): Promise<void> {
    const sessionData = await this.redis.get(`session:${sessionToken}`);
    if (sessionData) {
      const { userId } = JSON.parse(sessionData);
      
      // 标记离线
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user) {
        user.is_online = false;
        await this.userRepo.save(user);
      }
    }

    // 删除会话
    await this.redis.del(`session:${sessionToken}`);
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

### 会话过期
| 场景 | 行为 |
|------|------|
| Token 过期（1 小时） | 需要刷新 Token |
| 刷新 Token 过期（7 天） | 需要重新登录 |
| 用户登出 | 立即删除会话 |
| 修改密码 | 撤销所有会话（通过 MindAuth） |
| 封禁用户 | 立即删除所有会话 |

### 异常登录检测
| 检测项 | 规则 |
|--------|------|
| 异地登录 | IP 城市变化 |
| 异常时间 | 非活跃时段登录 |
| 频繁失败 | 15 分钟内登录失败 > 5 次 |
| 异常设备 | User-Agent 突然变化 |

### 登录日志
```sql
CREATE TABLE login_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status ENUM('success', 'failed') NOT NULL,
  failure_reason VARCHAR(100),  -- 失败原因
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC)
);
```

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

## MindAuth Token 刷新

### 自动刷新
当 access_token 过期时，使用 refresh_token 自动刷新：

```typescript
async refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
  const response = await this.httpService.post(
    `${process.env.MINDAUTH_URL}/oauth/token`,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.MINDAUTH_CLIENT_ID,
      client_secret: process.env.MINDAUTH_CLIENT_SECRET,
    }
  ).toPromise();

  return response.data;
}
```

---

## 安全注意事项

1. **HttpOnly Cookie**：前端 JS 无法读取，防止 XSS 窃取 Token
2. **SameSite Cookie**：防止 CSRF 攻击
3. **HTTPS**：生产环境必须使用 HTTPS
4. **Token 轮换**：每次刷新时生成新的 refresh_token
5. **MindAuth 依赖**：论坛不存储密码，所有密码相关操作通过 MindAuth
