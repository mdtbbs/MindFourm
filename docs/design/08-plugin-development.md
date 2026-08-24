# 插件开发规范

> **状态：后端部分已实现，前端扩展仍在规划中**
>
> 当前代码库已实现后端插件生命周期、配置、权限和 EventBus Hook；本文涉及的
> 前端组件注入、主题/模板扩展仍未实现。
> 文档内容作为参考，不代表现有功能。
> 
> 实现状态: **Phase 0 — 设计完成，开发未开始**

> 本文档记录了论坛系统插件的开发规范。
> 创建时间: 2026-06-07

## 插件系统概述

论坛系统基于 NestJS 实现了插件扩展机制，允许开发者通过钩子系统扩展核心功能，无需修改源代码。

---

## 插件结构

### 目录结构
```
my-plugin/
├── plugin.json              # 插件元数据
├── index.js                 # 插件入口文件
├── config.schema.json       # 配置项结构定义（可选）
├── default.config.json      # 默认配置（可选）
├── README.md                # 插件说明
└── lib/                     # 插件代码
    ├── hooks.js             # 钩子处理器
    └── utils.js             # 工具函数
```

### plugin.json
```json
{
  "name": "My Plugin",
  "slug": "my-plugin",
  "version": "1.0.0",
  "description": "插件描述",
  "author": "作者名",
  "author_url": "https://example.com",
  "main": "index.js",
  "permissions": ["post_create", "reply_create"],
  "dependencies": {
    "another-plugin": ">=1.0.0"
  }
}
```

---

## 钩子系统

### 钩子类型

| 类型 | 说明 | 返回值 | 示例 |
|------|------|--------|------|
| `before` | 在主操作之前执行，可修改输入数据 | 修改后的数据 | 帖子创建前过滤敏感词 |
| `after` | 在主操作之后执行，不阻塞主操作 | void | 帖子创建后发送通知 |
| `filter` | 转换/过滤数据，可串联多个钩子 | 转换后的数据 | 内容渲染、Markdown 扩展 |

### 注册钩子

在 `plugin.json` 中声明钩子：
```json
{
  "hooks": [
    {
      "name": "post.create",
      "type": "before",
      "handler": "beforePostCreate",
      "priority": 10
    },
    {
      "name": "post.created",
      "type": "after",
      "handler": "afterPostCreated",
      "priority": 0
    },
    {
      "name": "content.render",
      "type": "filter",
      "handler": "renderContent",
      "priority": 5
    }
  ]
}
```

### 可用钩子列表

#### 帖子相关
| 钩子名 | 类型 | 说明 |
|--------|------|------|
| `post.create` | before | 帖子创建前（可修改标题、内容） |
| `post.created` | after | 帖子创建后 |
| `post.update` | before | 帖子更新前 |
| `post.updated` | after | 帖子更新后 |
| `post.delete` | before | 帖子删除前 |
| `post.deleted` | after | 帖子删除后 |

#### 回复相关
| 钩子名 | 类型 | 说明 |
|--------|------|------|
| `reply.create` | before | 回复创建前 |
| `reply.created` | after | 回复创建后 |
| `reply.update` | before | 回复更新前 |
| `reply.updated` | after | 回复更新后 |

#### 用户相关
| 钩子名 | 类型 | 说明 |
|--------|------|------|
| `user.register` | after | 用户注册后 |
| `user.login` | after | 用户登录后 |
| `user.logout` | after | 用户登出后 |

#### 内容渲染
| 钩子名 | 类型 | 说明 |
|--------|------|------|
| `content.render` | filter | Markdown 渲染过滤 |
| `content.preview` | filter | 内容摘要生成 |

#### 系统相关
| 钩子名 | 类型 | 说明 |
|--------|------|------|
| `settings.changed` | after | 配置变更后 |
| `plugin.activated` | after | 插件启用后 |
| `plugin.deactivated` | after | 插件禁用后 |

---

## 插件入口文件

### index.js
```javascript
// 必须导出插件生命周期方法
module.exports = {
  /**
   * 插件加载时调用
   * 用于初始化资源、注册事件等
   */
  async onLoad(pluginConfig) {
    console.log(`[my-plugin] Loaded with config:`, pluginConfig);
  },

  /**
   * 插件卸载时调用
   * 用于清理资源、取消订阅等
   */
  async onUnload() {
    console.log('[my-plugin] Unloaded');
  },

  // ===== 钩子处理器 =====

  /**
   * before 钩子：帖子创建前
   * @param {Object} postData - 帖子数据
   * @param {Object} context - 上下文（用户信息、请求对象等）
   * @returns {Object} - 修改后的帖子数据
   */
  async beforePostCreate(postData, context) {
    // 示例：自动添加前缀到标题
    postData.title = `[前缀] ${postData.title}`;
    return postData;
  },

  /**
   * after 钩子：帖子创建后
   * @param {Object} post - 创建的帖子
   * @param {Object} context - 上下文
   */
  async afterPostCreated(post, context) {
    // 示例：发送通知
    console.log(`New post created: ${post.title}`);
  },

  /**
   * filter 钩子：内容渲染过滤
   * @param {string} content - 原始内容
   * @param {Object} context - 上下文
   * @returns {string} - 处理后的内容
   */
  async renderContent(content, context) {
    // 示例：添加自定义 shortcode 渲染
    content = content.replace(/\[youtube\](.*?)\[\/youtube\]/g, 
      '<iframe src="https://www.youtube.com/embed/$1"></iframe>');
    return content;
  }
};
```

---

## 配置系统

### config.schema.json
定义插件配置项的结构，用于管理后台自动生成配置表单：

```json
{
  "type": "object",
  "properties": {
    "apiKey": {
      "type": "string",
      "title": "API Key",
      "description": "第三方 API 密钥",
      "required": true
    },
    "enabled": {
      "type": "boolean",
      "title": "启用功能",
      "default": true
    },
    "maxItems": {
      "type": "number",
      "title": "最大数量",
      "default": 10,
      "minimum": 1,
      "maximum": 100
    },
    "theme": {
      "type": "string",
      "title": "主题",
      "enum": ["light", "dark", "auto"],
      "default": "auto"
    }
  }
}
```

### 默认配置
```json
{
  "apiKey": "",
  "enabled": true,
  "maxItems": 10,
  "theme": "auto"
}
```

### 读取配置
```javascript
// 插件内获取配置（通过上下文注入）
async function myHook(data, context) {
  const { pluginConfig } = context;
  if (pluginConfig.enabled) {
    // 执行插件逻辑
  }
}
```

---

## 插件 API

插件可通过 `context` 对象访问论坛系统提供的 API：

| API | 说明 |
|-----|------|
| `context.user` | 当前用户信息 |
| `context.request` | 请求对象 |
| `context.pluginConfig` | 插件当前配置 |
| `context.services.postService` | 帖子服务 |
| `context.services.userService` | 用户服务 |
| `context.services.notificationService` | 通知服务 |
| `context.services.emailService` | 邮件服务 |
| `context.logger` | 日志记录器 |

### 示例：在钩子中发送通知
```javascript
async afterPostCreated(post, context) {
  const { services, logger } = context;
  
  try {
    await services.notificationService.create({
      userId: post.authorId,
      type: 'system',
      title: '插件通知',
      content: `你的帖子 "${post.title}" 已发布成功`,
    });
    logger.info(`Notification sent for post ${post.id}`);
  } catch (error) {
    logger.error(`Failed to send notification: ${error.message}`);
  }
}
```

---

## 权限管理

### 声明权限需求
在 `plugin.json` 中声明需要的权限：
```json
{
  "permissions": ["post_create", "post_edit_any", "notification_send"]
}
```

### 检查权限
```javascript
async function beforePostCreate(postData, context) {
  const hasPermission = context.user.permissions.includes('post_create');
  if (!hasPermission) {
    throw new Error('You do not have permission to create posts');
  }
  return postData;
}
```

---

## 开发流程

### 1. 创建插件
```bash
mkdir my-plugin
cd my-plugin
# 创建 plugin.json、index.js、config.schema.json 等文件
```

### 2. 本地测试
1. 将插件文件夹放入论坛系统的 `plugins/` 目录
2. 在管理后台上传插件包（zip 格式）
3. 启用插件，测试钩子功能

### 3. 打包发布
```bash
# 打包为 zip
zip -r my-plugin.zip plugin.json index.js config.schema.json default.config.json lib/ README.md
```

### 4. 安装到生产环境
1. 管理后台 → 插件管理 → 上传插件包
2. 启用插件
3. 配置插件参数
4. 检查依赖是否满足

---

## 最佳实践

### 1. 错误处理
- 所有钩子函数使用 try/catch
- 错误不应阻塞主流程（after 钩子）
- 使用 `context.logger` 记录错误

```javascript
async afterPostCreated(post, context) {
  try {
    // 插件逻辑
  } catch (error) {
    context.logger.error(`[my-plugin] Error: ${error.message}`);
    // 不抛出异常，不影响主流程
  }
}
```

### 2. 性能优化
- before/filter 钩子应尽量快速返回
- 避免在钩子中进行大量数据库查询
- 使用 Redis 缓存频繁访问的数据

### 3. 兼容性
- 明确声明兼容的系统版本
- 不要在插件中直接修改数据库结构
- 使用系统提供的 API，不要直接访问数据库

### 4. 安全
- 不要存储敏感信息（密码、token 等）
- 验证所有用户输入
- 使用系统提供的权限检查

### 5. 日志
- 使用 `context.logger` 而不是 `console.log`
- 日志格式：`[插件名] 操作描述`
- 记录关键操作和错误信息

---

## 常见问题

### Q: 插件如何与另一个插件交互？
A: 通过声明依赖（`dependencies` 字段）和优先级（`priority` 字段）控制执行顺序。也可以直接使用系统提供的 API 调用其他插件功能。

### Q: 插件可以添加新的 API 端点吗？
A: 
- **Phase 1（当前规划）**：不支持自定义路由和前端 UI，仅支持后端钩子扩展。
- **Phase 2（未来版本）**：将支持插件注册自定义 API 路由和前端组件注入。

### Q: 插件可以修改前端 UI 吗？
A: 
- **Phase 1（当前规划）**：不支持。前端插件系统将在 Phase 2 实现。
- **Phase 2（未来版本）**：将支持前端组件注入、模板替换等前端扩展能力。

### Q: 如何调试插件？
A: 启用插件后，查看后端日志。也可以使用 `context.logger` 在代码中添加调试信息。
