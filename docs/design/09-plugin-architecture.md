# 插件系统架构设计

> **⚠️ 规划中（未实现）**
> 
> 本文档描述的是未来插件系统的规划，当前代码库尚未实现。
> 文档内容作为参考，不代表现有功能。
> 
> 实现状态: **Phase 0 — 设计完成，开发未开始**

> 本文档详细记录了论坛系统插件系统的架构设计。
> 创建时间: 2026-06-07

## 架构概述

插件系统基于 Node.js 动态加载 + 事件总线（EventBus）架构，支持后端钩子 + 前端组件注入，允许开发者通过插件扩展论坛功能。

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Plugin Manager                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Installer│  │  Loader  │  │Registry  │  │ Config Manager│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                          Event Bus                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Hooks    │  │ Routes   │  │Frontend  │  │ Middleware   │   │
│  │ Engine   │  │ Registry │  │ Components│ │ Injector     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                       Core System API                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │PostService│ │UserService│ │Notification│ │Email Service  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 插件包格式

### 打包格式
```
plugin-name-v1.0.0.zip
├── plugin.json              # 后端元数据
├── frontend.json            # 前端元数据（可选）
├── backend/
│   ├── index.js             # 后端入口
│   ├── hooks.js             # 钩子处理器
│   ├── routes.js            # 自定义路由（可选）
│   ├── middleware.js        # 自定义中间件（可选）
│   └── config.schema.json   # 后端配置结构
├── frontend/
│   ├── index.tsx            # 前端入口
│   ├── components/          # React 组件
│   ├── hooks/               # 自定义 Hooks
│   └── config.schema.json   # 前端配置结构
├── public/                  # 静态资源（图片、CSS）
│   └── plugin-name/
└── README.md
```

---

## 后端插件架构

### Plugin Manager

```typescript
// modules/admin/plugins/plugin-manager.service.ts
@Injectable()
export class PluginManagerService {
  private plugins: Map<string, PluginInstance> = new Map();
  private eventBus: EventBus;

  constructor(
    private pluginRepo: Repository<Plugin>,
    private pluginConfigService: PluginConfigService,
  ) {
    this.eventBus = new EventBus();
  }

  /**
   * 加载插件
   */
  async loadPlugin(slug: string): Promise<void> {
    const pluginRecord = await this.pluginRepo.findOne({ where: { slug } });
    if (!pluginRecord || !pluginRecord.is_installed) {
      throw new NotFoundException(`Plugin ${slug} not found`);
    }

    // 动态加载插件入口
    const pluginPath = path.join(__dirname, '../../../plugins', slug, 'backend', 'index.js');
    const pluginModule = require(pluginPath);

    // 读取配置
    const config = await this.pluginConfigService.getConfig(pluginRecord.id);

    // 创建插件实例
    const pluginInstance: PluginInstance = {
      slug: pluginRecord.slug,
      module: pluginModule,
      config,
      hooks: [],
      routes: [],
    };

    // 执行 onLoad
    if (pluginModule.onLoad) {
      await pluginModule.onLoad({
        pluginConfig: config,
        logger: this.createLogger(slug),
      });
    }

    // 注册钩子
    if (pluginModule.hooks) {
      for (const hookDef of pluginModule.hooks) {
        this.eventBus.registerHook(slug, hookDef, pluginModule);
        pluginInstance.hooks.push(hookDef);
      }
    }

    // 注册自定义路由
    if (pluginModule.routes) {
      this.registerRoutes(slug, pluginModule.routes);
      pluginInstance.routes = pluginModule.routes;
    }

    this.plugins.set(slug, pluginInstance);

    // 更新数据库状态
    pluginRecord.is_active = true;
    await this.pluginRepo.save(pluginRecord);
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(slug: string): Promise<void> {
    const pluginInstance = this.plugins.get(slug);
    if (!pluginInstance) return;

    // 执行 onUnload
    if (pluginInstance.module.onUnload) {
      await pluginInstance.module.onUnload();
    }

    // 注销钩子
    this.eventBus.unregisterHooks(slug);

    // 注销路由
    this.unregisterRoutes(slug);

    // 清除缓存
    delete require.cache[require.resolve(path.join(__dirname, '../../../plugins', slug, 'backend', 'index.js'))];

    this.plugins.delete(slug);

    // 更新数据库状态
    const pluginRecord = await this.pluginRepo.findOne({ where: { slug } });
    if (pluginRecord) {
      pluginRecord.is_active = false;
      await this.pluginRepo.save(pluginRecord);
    }
  }

  /**
   * 执行 before 钩子
   */
  async executeBeforeHook(hookName: string, data: any, context: HookContext): Promise<any> {
    const hooks = this.eventBus.getHooks(hookName, 'before');
    
    let result = data;
    for (const hook of hooks) {
      const plugin = this.plugins.get(hook.pluginSlug);
      if (!plugin || !plugin.module[hook.handler]) continue;
      
      result = await plugin.module[hook.handler](result, {
        ...context,
        pluginConfig: plugin.config,
        logger: this.createLogger(hook.pluginSlug),
      });
    }

    return result;
  }

  /**
   * 执行 after 钩子
   */
  async executeAfterHook(hookName: string, data: any, context: HookContext): Promise<void> {
    const hooks = this.eventBus.getHooks(hookName, 'after');

    for (const hook of hooks) {
      const plugin = this.plugins.get(hook.pluginSlug);
      if (!plugin || !plugin.module[hook.handler]) continue;

      // after 钩子不阻塞主流程
      plugin.module[hook.handler](data, {
        ...context,
        pluginConfig: plugin.config,
        logger: this.createLogger(hook.pluginSlug),
      }).catch((error: Error) => {
        this.createLogger(hook.pluginSlug).error(`after hook error: ${error.message}`);
      });
    }
  }

  /**
   * 执行 filter 钩子（串联）
   */
  async executeFilterHook(hookName: string, content: any, context: HookContext): Promise<any> {
    const hooks = this.eventBus.getHooks(hookName, 'filter');

    let result = content;
    // 按优先级排序
    hooks.sort((a, b) => a.priority - b.priority);

    for (const hook of hooks) {
      const plugin = this.plugins.get(hook.pluginSlug);
      if (!plugin || !plugin.module[hook.handler]) continue;

      result = await plugin.module[hook.handler](result, {
        ...context,
        pluginConfig: plugin.config,
        logger: this.createLogger(hook.pluginSlug),
      });
    }

    return result;
  }
}
```

### Event Bus

```typescript
// common/event-bus.ts
interface HookDefinition {
  name: string;          // 钩子名
  type: 'before' | 'after' | 'filter';
  handler: string;       // 处理函数名
  priority: number;      // 优先级（越小越先执行）
}

interface RegisteredHook {
  pluginSlug: string;
  hookDef: HookDefinition;
}

export class EventBus {
  private hooks: Map<string, RegisteredHook[]> = new Map();

  registerHook(pluginSlug: string, hookDef: HookDefinition, module: any): void {
    if (!this.hooks.has(hookDef.name)) {
      this.hooks.set(hookDef.name, []);
    }
    this.hooks.get(hookDef.name)!.push({ pluginSlug, hookDef });
  }

  getHooks(hookName: string, type: string): RegisteredHook[] {
    const allHooks = this.hooks.get(hookName) || [];
    return allHooks.filter(h => h.hookDef.type === type);
  }

  unregisterHooks(pluginSlug: string): void {
    for (const [name, hooks] of this.hooks.entries()) {
      this.hooks.set(name, hooks.filter(h => h.pluginSlug !== pluginSlug));
    }
  }

  getAllHooks(): Map<string, RegisteredHook[]> {
    return this.hooks;
  }
}
```

---

## 自定义路由注册

### 插件路由定义
```javascript
// backend/routes.js
module.exports = [
  {
    method: 'GET',
    path: '/api/plugins/my-plugin/stats',
    handler: 'getStats',
    permissions: ['my_plugin_view_stats'],
  },
  {
    method: 'POST',
    path: '/api/plugins/my-plugin/action',
    handler: 'doAction',
    permissions: ['my_plugin_do_action'],
  },
];
```

### 路由注册器
```typescript
// modules/admin/plugins/route-registrar.service.ts
@Injectable()
export class RouteRegistrarService {
  private dynamicRoutes: Map<string, RouteDefinition[]> = new Map();

  registerRoutes(pluginSlug: string, routes: RouteDefinition[]): void {
    this.dynamicRoutes.set(pluginSlug, routes);

    for (const route of routes) {
      // 动态注册到 NestJS 路由器
      this.router.registerRoute(route, pluginSlug);
    }
  }

  unregisterRoutes(pluginSlug: string): void {
    const routes = this.dynamicRoutes.get(pluginSlug) || [];
    for (const route of routes) {
      this.router.unregisterRoute(route);
    }
    this.dynamicRoutes.delete(pluginSlug);
  }
}
```

---

## 前端插件架构

### 前端插件加载

```typescript
// lib/plugin-loader.ts
interface FrontendPlugin {
  slug: string;
  name: string;
  version: string;
  components: Record<string, React.ComponentType>;
  hooks: Record<string, Function>;
  routes?: RouteDefinition[];
  injectPoints?: InjectPoint[];
  onLoad?: (config: Record<string, any>) => void;
  onUnload?: () => void;
}

interface InjectPoint {
  location: 'header' | 'footer' | 'sidebar' | 'post-toolbar' | 'reply-toolbar' | 'user-profile' | 'admin-sidebar';
  component: string;  // 组件名
  props?: Record<string, any>;
}

export class FrontendPluginManager {
  private plugins: Map<string, FrontendPlugin> = new Map();

  async loadPlugin(slug: string): Promise<void> {
    // 从后端获取前端插件元数据
    const meta = await fetch(`/api/admin/plugins/${slug}/frontend-meta`);
    const metaJson = await meta.json();

    // 动态 import 前端入口
    const pluginModule = await import(`../../plugins/${slug}/frontend/index.tsx`);

    const plugin: FrontendPlugin = {
      slug,
      name: metaJson.name,
      version: metaJson.version,
      components: pluginModule.components || {},
      hooks: pluginModule.hooks || {},
      routes: pluginModule.routes || [],
      injectPoints: metaJson.injectPoints || [],
      onLoad: pluginModule.onLoad,
      onUnload: pluginModule.onUnload,
    };

    // 执行 onLoad
    plugin.onLoad?.(metaJson.config);

    this.plugins.set(slug, plugin);
  }

  /**
   * 获取注入到特定位置的组件
   */
  getInjectedComponents(location: InjectPoint['location']): React.ComponentType[] {
    const components: React.ComponentType[] = [];
    
    for (const plugin of this.plugins.values()) {
      if (plugin.injectPoints) {
        for (const point of plugin.injectPoints) {
          if (point.location === location && plugin.components[point.component]) {
            components.push(plugin.components[point.component]);
          }
        }
      }
    }

    return components;
  }

  /**
   * 注册插件路由到前端路由系统
   */
  registerPluginRoutes(pluginSlug: string): void {
    const plugin = this.plugins.get(pluginSlug);
    if (!plugin || !plugin.routes) return;

    // 动态添加到 Next.js 路由
    for (const route of plugin.routes) {
      // Next.js App Router 不支持动态路由注册
      // 使用约定：插件放在 app/(plugins)/${slug}/* 目录下
    }
  }
}
```

### 前端注入点使用示例

```tsx
// components/layout/header.tsx
import { usePluginManager } from '@/lib/plugin-context';

export function Header() {
  const pluginManager = usePluginManager();
  const headerInjects = pluginManager.getInjectedComponents('header');

  return (
    <header>
      <nav>...</nav>
      {headerInjects.map((Component, index) => (
        <Component key={index} />
      ))}
    </header>
  );
}
```

```tsx
// components/post/post-toolbar.tsx
import { usePluginManager } from '@/lib/plugin-context';

export function PostToolbar({ postId }: { postId: number }) {
  const pluginManager = usePluginManager();
  const toolbarInjects = pluginManager.getInjectedComponents('post-toolbar');

  return (
    <div className="toolbar">
      <button>点赞</button>
      <button>收藏</button>
      {toolbarInjects.map((Component, index) => (
        <Component key={index} postId={postId} />
      ))}
    </div>
  );
}
```

---

## 插件安装流程

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  管理员   │     │ 管理后台  │     │PluginMgr │     │ 数据库    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ 1. 上传 zip    │                │                │
     │───────────────▶│                │                │
     │                │ 2. 解压验证    │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 3. 读取元数据  │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 4. 检查依赖    │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 5. 检查权限需求│                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 6. 保存到数据库│                │
     │                │───────────────────────────────▶│
     │                │                │                │
     │                │ 7. 初始化配置  │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 8. 返回安装结果│                │
     │◀───────────────│                │                │
     │                │                │                │
     │ 9. 启用插件    │                │                │
     │───────────────▶│                │                │
     │                │ 10. 加载插件   │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 11. 注册钩子   │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 12. 注册路由   │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │ 13. 更新状态   │                │
     │                │───────────────────────────────▶│
     │                │                │                │
     │ 14. 安装成功   │                │                │
     │◀───────────────│                │                │
```

---

## 插件依赖管理

### 依赖声明
```json
{
  "dependencies": {
    "markdown-editor": ">=1.0.0",
    "notification-plus": "^2.0.0"
  }
}
```

### 依赖检查
```typescript
async checkDependencies(pluginMeta: PluginMeta): Promise<DependencyCheckResult> {
  const results: DependencyCheckResult = { satisfied: true, missing: [] };

  for (const [depSlug, versionRange] of Object.entries(pluginMeta.dependencies || {})) {
    const installedPlugin = await this.pluginRepo.findOne({ where: { slug: depSlug } });
    
    if (!installedPlugin || !installedPlugin.is_installed) {
      results.satisfied = false;
      results.missing.push({ slug: depSlug, reason: 'not installed' });
      continue;
    }

    if (!semver.satisfies(installedPlugin.version, versionRange)) {
      results.satisfied = false;
      results.missing.push({ 
        slug: depSlug, 
        reason: `version mismatch (installed: ${installedPlugin.version}, required: ${versionRange})` 
      });
    }
  }

  return results;
}
```

### 依赖卸载保护
```typescript
async canUninstall(slug: string): Promise<boolean> {
  // 检查是否有其他插件依赖此插件
  const allPlugins = await this.pluginRepo.find({ where: { is_installed: true } });
  
  for (const plugin of allPlugins) {
    if (plugin.slug === slug) continue;
    
    const deps = plugin.dependencies || {};
    if (deps[slug]) {
      return false; // 有其他插件依赖，不允许卸载
    }
  }

  return true;
}
```

---

## 插件权限系统

### 插件专用权限
```sql
-- 插件权限表
CREATE TABLE plugin_permissions (
  plugin_id INT NOT NULL,
  permission_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100),
  description TEXT,
  is_granted BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (plugin_id, permission_name),
  FOREIGN KEY (plugin_id) REFERENCES plugins(id)
);
```

### 权限声明
```json
{
  "permissions": [
    {
      "name": "my_plugin_view_stats",
      "display_name": "查看统计",
      "description": "允许查看插件统计数据"
    },
    {
      "name": "my_plugin_do_action",
      "display_name": "执行操作",
      "description": "允许执行插件自定义操作"
    }
  ]
}
```

---

## 插件配置 UI 生成

### 前端动态表单生成器
```tsx
// components/admin/plugins/plugin-config-form.tsx
interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  title: string;
  description?: string;
  required?: boolean;
  default?: any;
  enum?: string[];       // select 选项
  minimum?: number;      // number 最小值
  maximum?: number;      // number 最大值
}

export function PluginConfigForm({ schema, values, onSubmit }: Props) {
  const fields = parseSchema(schema);

  return (
    <form onSubmit={onSubmit}>
      {fields.map(field => (
        <ConfigField
          key={field.key}
          type={field.type}
          title={field.title}
          description={field.description}
          value={values[field.key] ?? field.default}
          options={field.enum}
        />
      ))}
      <SubmitButton>保存配置</SubmitButton>
    </form>
  );
}
```

---

## 插件目录结构（运行时）

```
forum-backend/
├── src/
├── plugins/                    # 插件安装目录
│   ├── my-plugin/
│   │   ├── backend/
│   │   │   ├── index.js
│   │   │   ├── hooks.js
│   │   │   └── routes.js
│   │   ├── frontend/
│   │   │   ├── index.tsx
│   │   │   └── components/
│   │   ├── public/
│   │   │   └── my-plugin/
│   │   ├── plugin.json
│   │   └── frontend.json
│   └── another-plugin/
│       └── ...
└── dist/
```

---

## 插件生命周期

| 阶段 | 后端 | 前端 |
|------|------|------|
| **上传** | 解压 → 验证结构 → 读取元数据 | 上传到 frontend/plugins/ 目录 |
| **安装** | 写入数据库 → 初始化配置 → 检查依赖 | 注册前端路由（如有） |
| **启用** | require 入口 → onLoad → 注册钩子 → 注册路由 | import 入口 → onLoad → 注册注入点 |
| **禁用** | onUnload → 注销钩子 → 注销路由 | onUnload → 移除注入点 |
| **卸载** | 删除文件 → 清理数据库 → 清理配置 | 删除前端文件 |
| **更新** | 备份旧版本 → 安装新版本 → 迁移配置 | 更新前端文件 |

---

## 插件安全

### 运行时安全措施
1. **权限隔离**：插件只能通过系统提供的 API 访问，不能直接操作数据库
2. **超时保护**：每个钩子执行设置超时（默认 5 秒），超时强制终止
3. **错误隔离**：after 钩子错误不阻塞主流程，before/filter 钩子错误返回原始数据
4. **日志追踪**：所有插件操作记录到独立日志，便于审计

### 未来规划（沙箱）
- 使用 Node.js `vm` 模块创建沙箱环境
- 限制插件只能访问白名单模块
- 禁止使用 `require` 访问系统模块
- 内存使用限制（防止 OOM）
