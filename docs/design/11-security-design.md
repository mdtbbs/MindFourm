# 安全设计

> 本文档记录了论坛系统的安全设计方案。
> 创建时间: 2026-06-07

## 安全架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        安全防护层                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Rate     │  │ XSS/CSRF │  │ Captcha  │  │ Bot Detection │   │
│  │ Limiting │  │ Protection│ │          │  │ & IP Block    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                       应用安全层                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Auth     │  │ Permission│ │ Content  │  │ SQL Injection │   │
│  │ JWT/OAuth│  │ Guard    │  │ Filter   │  │ Prevention    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                       数据安全层                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ Password │  │ Session  │  │ Data     │                      │
│  │ Hashing  │  │ Security │  │ Encryption│                     │
│  └──────────┘  └──────────┘  └──────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. XSS 防护

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

## 2. CSRF 防护

### 策略
- 使用双重提交 Cookie 模式
- 所有状态修改操作（POST/PUT/DELETE）必须携带 CSRF Token
- GET 请求不检查 CSRF

### 实现
```typescript
// common/middleware/csrf.middleware.ts
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfToken = req.headers['x-csrf-token'];
      const csrfCookie = req.cookies['csrf-token'];
      
      if (!csrfToken || csrfToken !== csrfCookie) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    }
    next();
  }
}
```

---

## 3. Rate Limiting（频率限制）

### 基于 Redis 的频率限制
```typescript
// common/guards/rate-limit.guard.ts
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip;
    const key = `rate_limit:${ip}:${context.getHandler().name}`;
    
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60); // 1 分钟窗口
    }
    
    if (current > 60) { // 每分钟 60 次
      throw new TooManyRequestsException('请求过于频繁，请稍后再试');
    }
    
    return true;
  }
}
```

### 频率限制规则
| 操作 | 限制 | 窗口 |
|------|------|------|
| 发帖 | 10 次 | 1 小时 |
| 回复 | 30 次 | 1 小时 |
| 点赞 | 50 次 | 1 小时 |
| 登录 | 5 次 | 15 分钟 |
| 注册 | 3 次 | 1 小时 |
| 上传附件 | 20 次 | 1 小时 |
| API 请求 | 60 次 | 1 分钟 |

---

## 4. Captcha（验证码）

### 策略
- 注册：必须验证码
- 登录：连续 3 次失败后显示验证码
- 发帖/回复：新用户（注册 < 24 小时）需要验证码
- 敏感操作（修改密码、修改邮箱）：必须验证码

### 类型
- 默认：数学题验证码（简单）
- 可选：Google reCAPTCHA v3（无感）
- 可选：hCaptcha

### 实现
```typescript
// common/validators/captcha.validator.ts
@Injectable()
export class CaptchaValidator {
  async verify(token: string, ip: string): Promise<boolean> {
    // reCAPTCHA v3 验证
    const response = await this.httpService.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      { params: { secret: this.secretKey, response: token, remoteip: ip } }
    );
    
    return response.data.success && response.data.score > 0.5;
  }
}
```

---

## 5. Bot 检测

### 检测方式
| 方法 | 说明 |
|------|------|
| Honeypot | 隐藏表单字段，机器人会自动填充 |
| IP 检测 | 检查 IP 是否在已知机器人 IP 列表中 |
| 行为分析 | 检测操作间隔、鼠标移动等人类行为特征 |
| User-Agent 检查 | 检测异常的 User-Agent |

### 处理措施
| 置信度 | 措施 |
|--------|------|
| > 0.8 | 直接封禁 IP |
| 0.5-0.8 | 标记待审核 |
| 0.3-0.5 | 要求验证码 |
| < 0.3 | 放行 |

### 记录表
```sql
CREATE TABLE bot_detection_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ip_address VARCHAR(45),
  user_id INT,
  action VARCHAR(100),
  is_bot BOOLEAN,
  detection_method ENUM('captcha', 'behavior', 'ip_check', 'honeypot'),
  confidence_score DECIMAL(5,2),
  action_taken ENUM('none', 'blocked', 'flagged', 'banned'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. IP 黑名单

### 管理
- 支持单个 IP 和 IP 范围（CIDR）
- 可设置过期时间
- 可添加备注原因
- 管理后台管理

### 检查中间件
```typescript
// common/middleware/ip-block.middleware.ts
@Injectable()
export class IpBlockMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip;
    const isBlocked = await this.ipBlockService.isBlocked(ip);
    
    if (isBlocked) {
      throw new ForbiddenException('Your IP has been blocked');
    }
    next();
  }
}
```

---

## 7. 密码安全

### MindAuth 集成
- 论坛系统不存储密码，完全依赖 MindAuth OAuth
- 密码策略由 MindAuth 管理
- 密码重置通过 MindAuth 完成

---

## 8. SQL 注入防护

- 使用 TypeORM 参数化查询
- 禁止直接拼接 SQL
- 用户输入始终作为参数传递
- 复杂的 LIKE 查询使用转义函数

```typescript
// 安全的 LIKE 查询
const searchTerm = '%'.replace(/[%_]/g, '\\$&') + userInput.replace(/[%_]/g, '\\$&') + '%';
const posts = await this.postRepo.find({
  where: { title: Like(searchTerm) },
});
```

---

## 9. 会话安全

### JWT 策略
| 配置 | 值 |
|------|------|
| 访问 Token 有效期 | 1 小时 |
| 刷新 Token 有效期 | 7 天 |
| 刷新策略 | 滑动过期（每次使用刷新时延长） |
| Token 存储 | HttpOnly Cookie（前端不可访问） |

### 会话管理
- 用户登出时撤销 Token
- 修改密码时撤销所有会话
- 同一账号同时登录限制（可选配置）
- 异常登录检测（异地 IP、异常时间）

---

## 10. 安全审计

### 操作日志
所有敏感操作记录到 `operation_logs` 表：
- 登录/登出
- 密码修改
- 角色变更
- 封禁/解封
- 帖子删除
- 设置修改

### 定期安全检查
- 每月审查频率限制配置
- 每季度审查 IP 黑名单
- 持续监控异常流量
