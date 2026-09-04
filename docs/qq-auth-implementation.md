# QQ OAuth2 登录集成实施进度

## 概述
本文档记录了 MindFourm 论坛系统集成 QQ OAuth2 登录的实施进度和技术细节。

## 已完成工作

### Phase 1: 数据库基础设施 ✅

#### 1.1 数据库迁移
- **文件**: `src/database/migrations/1720000017000-AddQQAuthTables.ts`
- **内容**:
  - 创建 `user_devices` 表（用户设备管理）
  - 创建 `login_log` 表（登录日志）
  - 修改 `users` 表添加 QQ 相关字段：
    - `qq_openid` (VARCHAR(100), UNIQUE)
    - `qq_unionid` (VARCHAR(100), UNIQUE)
    - `qq_nickname` (VARCHAR(100))
    - `qq_avatar` (VARCHAR(500))
  - 添加索引：`idx_qq_openid`, `idx_qq_unionid`

#### 1.2 TypeORM Entity
- **新增文件**:
  - `src/entities/user-device.entity.ts` - 用户设备实体
  - `src/entities/login-log.entity.ts` - 登录日志实体
  
- **修改文件**:
  - `src/entities/user.entity.ts` - 添加 QQ OAuth 字段
  - `src/entities/index.ts` - 注册新实体

#### 1.3 环境配置
- **文件**: `.env.example`
- **新增配置项**:
  ```env
  QQ_APP_ID=your-qq-app-id
  QQ_APP_KEY=your-qq-app-key
  QQ_CALLBACK_URL=http://localhost:4000/api/qq-auth/callback
  QQ_SCOPE=get_user_info
  ```

### Phase 2: 核心服务 ✅

#### 2.1 模块结构
```
src/modules/qq-auth/
├── qq-auth.module.ts          # 模块定义
├── qq-auth.controller.ts      # 控制器（API 端点）
├── qq-auth.service.ts         # 服务层（核心业务逻辑）
├── dto/
│   └── qq-login.dto.ts        # QQ 登录请求 DTO
└── interfaces/
    └── qq-user.interface.ts   # QQ 用户信息接口
```

#### 2.2 核心功能实现

##### QQAuthService 主要方法

1. **OAuth2 流程**
   - `generateAuthorizeUrl()` - 生成 QQ 授权 URL
   - `generateState()` - 生成防 CSRF state 参数
   - `saveState()` / `validateState()` - State 参数管理
   - `getAccessToken()` - 使用授权码获取 Access Token
   - `getOpenId()` - 获取用户 OpenID 和 UnionID
   - `getUserInfo()` - 获取 QQ 用户信息

2. **用户管理**
   - `getOrCreateUser()` - 查找或创建用户
   - `generateMindAuthId()` - 为 QQ 用户生成唯一的 mindauth_id
   - `unbindQQ()` - 解绑 QQ 账号

3. **设备管理**
   - `generateDeviceToken()` - 生成设备令牌
   - `saveDeviceToken()` - 保存设备信息
   - `generateDeviceName()` - 生成设备名称

4. **日志与 Session**
   - `recordLoginLog()` - 记录登录日志
   - `createSession()` - 创建用户 Session
   - `cancelPendingDeletion()` - 取消待处理的注销申请（待实现）

##### QQAuthController API 端点

1. **GET /api/qq-auth/authorize**
   - 获取 QQ 授权 URL
   - 返回授权链接和 state 参数

2. **GET /api/qq-auth/callback**
   - QQ 授权回调（Web 端）
   - 处理授权码，创建/更新用户
   - 设置 Session Cookie
   - 重定向到首页

3. **POST /api/qq-auth/login-with-code**
   - 使用授权码登录（App 端或 AJAX）
   - 返回用户信息和 Token

4. **POST /api/qq-auth/unbind**
   - 解绑 QQ 账号（需要登录）

#### 2.3 模块注册
- **文件**: `src/app.module.ts`
- **变更**: 导入并注册 `QQAuthModule`

### Phase 3: 构建验证 ✅

- ✅ 后端构建成功（`npm run build:backend`）
- ✅ 前端构建成功（`npm run build:frontend`）
- ✅ 无 TypeScript 编译错误

## 技术实现细节

### 1. mindauth_id 生成策略

由于 QQ 用户没有 MindAuth ID，使用以下策略生成唯一 ID：
```typescript
private generateMindAuthId(openId: string): number {
  const hash = crypto.createHash('sha256').update(openId).digest('hex');
  const id = parseInt(hash.substring(0, 8), 16);
  return 1000000 + (id % 9000000); // 范围：1000000-9999999
}
```

### 2. 用户名字段处理

QQ 用户可能有中文字符，处理策略：
- 如果有昵称：使用 `QQ用户{昵称前6位}`
- 如果无昵称：使用 `QQ用户{openid前6位}`

### 3. 头像同步策略

根据需求，只在以下情况同步 QQ 头像：
- 新用户注册时
- 用户没有头像时

### 4. 设备 Token 有效期

- 设备 Token 有效期：30 天
- Session 有效期：7 天

## 待完成工作

### 1. 数据库迁移执行
```bash
npm run migration:run
```

### 2. 功能测试

#### 2.1 后端 API 测试
- [ ] 测试 `/api/qq-auth/authorize` 端点
- [ ] 测试 `/api/qq-auth/callback` 回调处理
- [ ] 测试 `/api/qq-auth/login-with-code` 登录
- [ ] 测试 `/api/qq-auth/unbind` 解绑

#### 2.2 集成测试
- [ ] 完整 OAuth2 流程测试
- [ ] 新用户注册流程
- [ ] 老用户登录流程
- [ ] 设备管理功能
- [ ] 登录日志记录

### 3. 前端集成

#### 3.1 登录页面
- [ ] 添加 QQ 登录按钮
- [ ] 处理授权回调
- [ ] 错误处理

#### 3.2 用户设置页面
- [ ] 添加 QQ 绑定/解绑功能
- [ ] 显示 QQ 账号信息

### 4. QQ 互联后台配置
- [ ] 创建网站应用
- [ ] 配置回调域名
- [ ] 获取 App ID 和 App Key
- [ ] 配置权限（get_user_info）

### 5. 安全加固
- [ ] 实现 rate limiting
- [ ] 完善错误处理
- [ ] 添加日志记录
- [ ] 实现 `cancelPendingDeletion()` 方法

## 已知问题

### 1. TypeScript 类型定义
- 已将 `User.avatar_url` 类型从 `string` 改为 `string | null`
- 已将 `User.qq_*` 字段类型设置为 `string | null`

### 2. IP 地址获取
- 使用 `req.ip || '127.0.0.1'` 作为 fallback
- 在生产环境需要配置正确的 proxy 设置

## 下一步计划

1. **执行数据库迁移**
   ```bash
   npm run migration:run
   ```

2. **配置环境变量**
   - 在 `.env` 文件中配置 QQ_APP_ID 和 QQ_APP_KEY
   - 配置 QQ_CALLBACK_URL

3. **测试后端 API**
   - 使用 Postman 或 curl 测试各个端点
   - 验证 OAuth2 流程

4. **前端集成**
   - 添加 QQ 登录按钮
   - 处理授权回调
   - 用户设置页面集成

5. **部署到测试环境**
   - 配置 QQ 互联后台
   - 测试完整流程

## 参考资料

- [QQ 互联 OAuth2.0 文档](https://wiki.connect.qq.com/%e5%87%86%e5%a4%87%e5%b7%a5%e4%bd%9c_oauth2-0)
- [OAuth 2.0 授权码模式](https://tools.ietf.org/html/rfc6749#section-4.1)
- [NestJS 官方文档](https://docs.nestjs.com/)
- [TypeORM 文档](https://typeorm.io/)

## 实施人员

- **开发**: AI Assistant
- **审核**: 待人工审核
- **测试**: 待测试

## 更新日志

### 2024-01-XX
- ✅ 完成 Phase 1: 数据库基础设施
- ✅ 完成 Phase 2: 核心服务
- ✅ 完成 Phase 3: 构建验证
- 🔄 待执行：数据库迁移
- 🔄 待执行：功能测试
- 🔄 待执行：前端集成

---

**文档状态**: 进行中  
**最后更新**: 2024-01-XX  
**版本**: v0.1.0
