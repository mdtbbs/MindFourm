# 邮件链接修复 - 测试和部署说明

## 修改总结

已修复MindFourm邮件链接指向localhost的问题。所有邮件链接现在都会使用数据库配置的 `site_url`。

### 修改的文件

1. **src/modules/settings/settings.service.ts** (第181行)
   - `site_url` 默认值从环境变量 `FRONTEND_URL` 读取
   - 添加了清晰的中文描述

2. **src/modules/rss/rss.service.ts** (第36行、第68行)
   - RSS链接改用数据库配置
   - 注入了 `SettingsService`

3. **src/modules/rss/rss.module.ts**
   - 导入了 `SettingsModule`

4. **.env.production.example**
   - 添加了 `FRONTEND_URL` 配置的详细说明

5. **CLAUDE.md**
   - 添加了环境配置说明

## 快速修复（现有部署）

如果你的论坛已经部署并且邮件链接指向localhost，可以通过以下方式快速修复：

### 方式1：通过管理后台（推荐）

1. 登录管理后台
2. 进入「基础设置」
3. 找到「站点URL」字段
4. 修改为你的实际域名（如 `https://forum.example.com`）
5. 保存

### 方式2：通过SQL直接修改

```sql
-- 连接到MySQL数据库
mysql -u root -p mindfourm

-- 修改 site_url
UPDATE settings 
SET value = 'https://forum.example.com' 
WHERE key = 'site_url';

-- 验证修改
SELECT key, value, description FROM settings WHERE key = 'site_url';
```

### 方式3：通过API修改

```bash
# 替换为你的实际域名和管理员token
curl -X PATCH https://api.forum.example.com/api/settings/basic \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"site_url": "https://forum.example.com"}'
```

## 新部署配置

### 1. 配置环境变量

在 `.env` 或 `.env.production` 文件中设置：

```bash
# 重要：设置为实际运营域名
FRONTEND_URL=https://forum.example.com
```

### 2. 启动应用

```bash
npm run build
npm run start:prod
```

### 3. 验证配置

数据库初始化时，`site_url` 会自动使用 `FRONTEND_URL` 的值。

验证方法：
```sql
SELECT key, value FROM settings WHERE key = 'site_url';
-- 应该显示 https://forum.example.com
```

## 测试计划

### 测试1：检查配置是否正确

```bash
# 通过API查看当前配置
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://api.forum.example.com/api/settings/public | jq '.data.site_url'

# 应该返回你的实际域名
```

### 测试2：发送测试邮件

1. **注册新用户**
   - 检查欢迎邮件中的链接是否指向正确域名

2. **触发回复通知**
   - 创建帖子并回复
   - 检查回复通知邮件中的链接

3. **触发@提及通知**
   - 在帖子中@其他用户
   - 检查提及通知邮件中的链接

4. **发送私信**
   - 检查私信通知邮件中的链接

### 测试3：检查RSS订阅

```bash
# 检查帖子RSS
curl https://forum.example.com/rss/posts | grep '<link>'

# 应该看到类似：
# <link>https://forum.example.com</link>
# <link>https://forum.example.com/posts/123</link>
```

### 测试4：验证配置优先级

配置优先级（从高到低）：
1. 数据库 `site_url` 设置
2. 环境变量 `FRONTEND_URL`
3. localhost（仅开发环境）

测试方法：
```bash
# 1. 设置环境变量
export FRONTEND_URL=https://env.example.com

# 2. 清空数据库并重启
# 3. 检查 site_url
SELECT key, value FROM settings WHERE key = 'site_url';
# 应该显示 https://env.example.com

# 4. 通过管理后台修改 site_url 为 https://admin.example.com
# 5. 重启应用
# 6. 再次检查
SELECT key, value FROM settings WHERE key = 'site_url';
# 应该显示 https://admin.example.com（数据库配置优先）
```

## 验证邮件链接

### 方法1：查看邮件源码

在邮件客户端中查看邮件源码，检查链接：

```html
<!-- 应该看到类似 -->
<a href="https://forum.example.com/posts/123">查看帖子</a>

<!-- 而不是 -->
<a href="http://localhost:3000/posts/123">查看帖子</a>
```

### 方法2：使用测试邮件服务

使用Mailtrap或Mailhog等测试邮件服务，可以方便地查看邮件内容和链接。

### 方法3：查看邮件日志

```bash
# 查看最近发送的邮件
SELECT id, email_type, to_email, subject, status, sent_at 
FROM email_logs 
ORDER BY sent_at DESC 
LIMIT 10;
```

## 常见问题

### Q1: 修改 `site_url` 后，历史邮件的链接会更新吗？

**不会**。修改 `site_url` 只影响新发出的邮件，历史邮件中的链接不会自动更新。

### Q2: 可以不设置 `FRONTEND_URL` 吗？

**可以**，但不推荐。如果不设置：
- 新部署：`site_url` 默认为 `http://localhost:3000`
- 现有部署：`site_url` 保持原有值

生产环境建议始终设置 `FRONTEND_URL`。

### Q3: 数据库配置和环境变量配置有什么区别？

| 配置方式 | 优先级 | 修改方式 | 适用场景 |
|---------|--------|---------|---------|
| 数据库 `site_url` | 最高 | 管理后台/API/SQL | 动态修改，无需重启 |
| 环境变量 `FRONTEND_URL` | 中 | .env文件 | 初始部署，自动化部署 |
| localhost默认值 | 最低 | 代码 | 仅开发环境 |

### Q4: 如何批量更新历史邮件中的链接？

目前不支持自动批量更新。如果需要，可以：
1. 导出邮件日志
2. 使用脚本替换链接
3. 重新发送邮件（谨慎操作）

建议：在部署时就正确配置 `site_url`，避免后续需要批量更新。

## 回滚方案

如果修改后出现问题，可以回滚到原来的配置：

```sql
-- 回滚到localhost（不推荐生产环境）
UPDATE settings 
SET value = 'http://localhost:3000' 
WHERE key = 'site_url';
```

或者通过管理后台修改回原来的值。

## 技术细节

### 配置优先级实现

**notifications.service.ts** (第77-84行):
```typescript
private async getFrontendUrl(): Promise<string> {
  try {
    const configured = await this.settingsService.get('site_url');
    return configured?.trim() || this.fallbackFrontendUrl;
  } catch {
    return this.fallbackFrontendUrl;
  }
}
```

**rss.service.ts** (第36行、第68行):
```typescript
const frontendUrl = await this.settingsService.get('site_url')
  || this.configService.get<string>('app.frontendUrl')
  || 'http://localhost:3000';
```

### 数据库默认值实现

**settings.service.ts** (第181行):
```typescript
{ 
  key: 'site_url', 
  value: process.env.FRONTEND_URL || 'http://localhost:3000', 
  category: 'basic', 
  description: '站点URL - 用于生成邮件链接、RSS订阅等，必须设置为实际运营域名' 
}
```

## 验收标准

- [x] 新部署时，`site_url` 自动使用 `FRONTEND_URL` 环境变量
- [x] 现有部署可以通过管理后台修改 `site_url`
- [x] 所有邮件链接使用数据库配置的 `site_url`
- [x] RSS链接使用数据库配置的 `site_url`
- [x] 部署文档清晰，包含配置说明
- [x] 代码编译成功，无错误

## 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目文档
- [.env.production.example](../.env.production.example) - 生产环境配置示例
- [计划文档](./bug-localhost-temporal-panda.md) - 详细实施方案

---

**创建日期**: 2026-07-31  
**最后更新**: 2026-07-31
