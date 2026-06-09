# 前端模板系统设计

> **⚠️ 规划中（未实现）**
> 
> 本文档描述的是未来插件系统的规划，当前代码库尚未实现。
> 文档内容作为参考，不代表现有功能。
> 
> 实现状态: **Phase 0 — 设计完成，开发未开始**

> 本文档记录了论坛系统的前端模板系统设计，支持通用模板 + 插件动态修改。
> 创建时间: 2026-06-07

## 架构概述

前端基于 **React 组件模板系统**，提供通用模板作为默认实现，插件和管理员可以通过 **模板替换 + 注入点** 机制修改前端展示，支持 **主题切换式** 覆盖规则，全站所有页面均可被插件修改。

---

## 模板架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Template Engine                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Template     │  │ Theme        │  │ Plugin               │  │
│  │ Registry     │  │ Manager      │  │ Template Injector    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      Base Templates                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Home     │  │ PostList │  │ PostDetail│ │ UserProfile  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                       Inject Points                               │
│  header | footer | sidebar | post-toolbar | reply-toolbar |     │
│  user-profile | admin-sidebar | post-content | user-badges     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 通用模板系统

### 基础模板结构

系统提供一套完整的通用模板作为默认实现，所有模板基于 React 组件：

```tsx
// templates/base/post-detail.tsx
interface PostDetailTemplate {
  // 模板组件
  Container: React.ComponentType<PostDetailProps>;
  Header: React.ComponentType<PostDetailProps>;
  Content: React.ComponentType<PostDetailProps>;
  Sidebar: React.ComponentType<PostDetailProps>;
  Replies: React.ComponentType<PostDetailProps>;
  Footer: React.ComponentType<PostDetailProps>;
}

// 默认模板实现
export const DefaultPostDetailTemplate: PostDetailTemplate = {
  Container: ({ children }) => <div className="container mx-auto">{children}</div>,
  Header: ({ post }) => (
    <header className="mb-6">
      <h1 className="text-3xl font-bold">{post.title}</h1>
      <PostMeta author={post.author} createdAt={post.created_at} />
    </header>
  ),
  Content: ({ post }) => (
    <article className="prose max-w-none" dangerouslySetInnerHTML={{ __html: post.content_html }} />
  ),
  Sidebar: ({ post }) => (
    <aside className="sticky top-16">
      {post.toc && <TableOfContents items={post.toc} />}
      <PostActions postId={post.id} />
    </aside>
  ),
  Replies: ({ replies, onReply }) => (
    <section className="mt-8">
      <ReplyList replies={replies} />
      <ReplyForm onSubmit={onReply} />
    </section>
  ),
  Footer: () => <PostFooter />,
};
```

### 模板注册表

```typescript
// lib/template-registry.ts
interface TemplateDefinition {
  name: string;
  slug: string;
  version: string;
  author?: string;
  description?: string;
  // 模板组件映射
  templates: Record<string, React.ComponentType<any>>;
  // 覆盖的基础模板
  extends?: string;
  // 优先级（用于主题切换）
  priority: number;
}

export class TemplateRegistry {
  private templates: Map<string, TemplateDefinition> = new Map();
  private activeTheme: string = 'default';

  /**
   * 注册模板
   */
  register(template: TemplateDefinition): void {
    this.templates.set(template.slug, template);
  }

  /**
   * 获取当前激活的主题模板
   */
  getActiveTemplate(page: string): React.ComponentType<any> {
    // 优先级：插件模板 > 自定义主题 > 系统默认
    const pluginTemplate = this.getPluginTemplate(page);
    if (pluginTemplate) return pluginTemplate;

    const themeTemplate = this.getThemeTemplate(page);
    if (themeTemplate) return themeTemplate;

    // 回退到系统默认
    return this.getDefaultTemplate(page);
  }

  /**
   * 获取插件模板
   */
  getPluginTemplate(page: string): React.ComponentType<any> | null {
    // 查找已启用插件中注册的最高优先级模板
    const pluginTemplates = this.getPluginTemplatesForPage(page);
    if (pluginTemplates.length === 0) return null;

    // 返回优先级最高的
    return pluginTemplates[0].component;
  }

  /**
   * 获取当前主题的模板
   */
  getThemeTemplate(page: string): React.ComponentType<any> | null {
    const theme = this.templates.get(this.activeTheme);
    if (!theme || !theme.templates[page]) return null;
    return theme.templates[page];
  }

  /**
   * 切换主题
   */
  setActiveTheme(slug: string): void {
    if (!this.templates.has(slug)) {
      throw new Error(`Theme ${slug} not found`);
    }
    this.activeTheme = slug;
  }
}
```

---

## 注入点系统

### 预定义注入点

| 注入点位置 | 页面 | 说明 |
|------------|------|------|
| `header.before-nav` | 全站 | 导航栏之前 |
| `header.after-nav` | 全站 | 导航栏之后 |
| `footer.before-content` | 全站 | 页脚内容之前 |
| `sidebar.top` | 帖子列表/详情 | 侧边栏顶部 |
| `sidebar.bottom` | 帖子列表/详情 | 侧边栏底部 |
| `post-toolbar.before` | 帖子详情 | 帖子工具栏之前 |
| `post-toolbar.after` | 帖子详情 | 帖子工具栏之后 |
| `post-content.before` | 帖子详情 | 正文内容之前 |
| `post-content.after` | 帖子详情 | 正文内容之后 |
| `reply-toolbar.before` | 帖子详情 | 回复工具栏之前 |
| `reply-toolbar.after` | 帖子详情 | 回复工具栏之后 |
| `user-profile.before-info` | 用户资料 | 用户信息之前 |
| `user-profile.after-info` | 用户资料 | 用户信息之后 |
| `user-badges.after` | 用户资料 | 徽章区域之后 |
| `admin-sidebar.top` | 管理后台 | 侧边栏顶部 |
| `admin-sidebar.bottom` | 管理后台 | 侧边栏底部 |
| `admin-dashboard.before-stats` | 管理仪表盘 | 统计卡片之前 |
| `admin-dashboard.after-stats` | 管理仪表盘 | 统计卡片之后 |

### 注入点使用示例

```tsx
// components/layout/header.tsx
import { useInjectPoints } from '@/lib/inject-context';

export function Header() {
  const beforeNavInjects = useInjectPoints('header.before-nav');
  const afterNavInjects = useInjectPoints('header.after-nav');

  return (
    <header>
      {beforeNavInjects.map((Component, i) => <Component key={i} />)}
      <nav>...</nav>
      {afterNavInjects.map((Component, i) => <Component key={i} />)}
    </header>
  );
}
```

```tsx
// app/(public)/posts/[id]/page.tsx
import { useInjectPoints } from '@/lib/inject-context';
import { useTemplateRegistry } from '@/lib/template-context';

export default function PostDetailPage({ params }: { params: { id: string } }) {
  const template = useTemplateRegistry().getActiveTemplate('post-detail');
  const postContentInjects = useInjectPoints('post-content.after');

  return (
    <template.Container>
      <template.Header />
      <template.Content />
      {postContentInjects.map((Component, i) => <Component key={i} postId={params.id} />)}
      <template.Sidebar />
      <template.Replies />
      <template.Footer />
    </template.Container>
  );
}
```

---

## 主题切换式覆盖规则

### 主题管理

管理员可以在管理后台选择启用哪个主题，主题优先级：

```
系统默认模板 < 自定义主题 < 插件模板
```

| 主题类型 | 来源 | 优先级 |
|----------|------|--------|
| 系统默认 | 内置 | 最低 |
| 自定义主题 | 管理后台上传/创建 | 中 |
| 插件模板 | 插件安装时注册 | 最高 |

### 主题切换逻辑

```typescript
// lib/theme-manager.ts
export class ThemeManager {
  private activeTheme: string = 'default';
  private pluginOverrides: Map<string, TemplateDefinition[]> = new Map();

  /**
   * 设置主题（管理后台操作）
   */
  setTheme(slug: string): void {
    this.activeTheme = slug;
    // 保存到系统设置
    await this.settingsService.set('active_theme', slug);
  }

  /**
   * 获取最终渲染的模板
   * 合并：系统默认 + 自定义主题 + 插件覆盖
   */
  resolveTemplate(page: string): React.ComponentType<any> {
    // 1. 获取系统默认模板
    const baseTemplate = this.getDefaultTemplate(page);

    // 2. 获取当前主题的覆盖
    const themeOverride = this.getThemeOverride(page);

    // 3. 获取插件的覆盖（最高优先级）
    const pluginOverride = this.getPluginOverride(page);

    // 4. 合并（后者覆盖前者）
    return pluginOverride || themeOverride || baseTemplate;
  }
}
```

---

## 插件前端注册

### frontend.json
```json
{
  "name": "My Plugin Frontend",
  "slug": "my-plugin",
  "version": "1.0.0",
  "main": "frontend/index.tsx",
  "templates": [
    {
      "page": "post-detail",
      "component": "CustomPostDetailTemplate",
      "priority": 10
    },
    {
      "page": "user-profile",
      "component": "CustomUserProfileTemplate",
      "priority": 5
    }
  ],
  "injectPoints": [
    {
      "location": "post-content.after",
      "component": "RelatedPostsWidget"
    },
    {
      "location": "user-profile.after-info",
      "component": "UserStatsCard"
    },
    {
      "location": "header.after-nav",
      "component": "NotificationBadge"
    }
  ]
}
```

### 插件前端入口
```tsx
// plugins/my-plugin/frontend/index.tsx
export const components = {
  CustomPostDetailTemplate: CustomPostDetailTemplate,
  CustomUserProfileTemplate: CustomUserProfileTemplate,
  RelatedPostsWidget: RelatedPostsWidget,
  UserStatsCard: UserStatsCard,
  NotificationBadge: NotificationBadge,
};

export function onLoad(config: Record<string, any>) {
  console.log('[my-plugin] Frontend loaded');
}
```

### 模板替换组件示例
```tsx
// plugins/my-plugin/frontend/components/custom-post-detail.tsx
export function CustomPostDetailTemplate(props: PostDetailProps) {
  const { post } = props;

  return (
    <div className="custom-post-layout">
      {/* 完全自定义的帖子详情布局 */}
      <div className="custom-header">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-500">
          {post.title}
        </h1>
        {/* 自定义作者卡片 */}
        <AuthorCard author={post.author} />
      </div>

      {/* 自定义内容区域 */}
      <div className="custom-content">
        <ArticleRenderer content={post.content_html} />
      </div>

      {/* 自定义侧边栏 */}
      <CustomSidebar post={post} />
    </div>
  );
}
```

---

## 模板开发规范

### 模板 Props 接口
所有模板组件必须遵循统一的 Props 接口：

```typescript
// types/template.ts
interface BaseTemplateProps {
  className?: string;
  style?: React.CSSProperties;
}

interface PostTemplateProps extends BaseTemplateProps {
  post: Post;
  author: User;
  category?: Category;
  tags?: Tag[];
  replies?: Reply[];
  canEdit: boolean;
  canDelete: boolean;
  canReply: boolean;
}

interface UserTemplateProps extends BaseTemplateProps {
  user: UserProfile;
  isOwner: boolean;
  canFollow: boolean;
  stats: UserStats;
}
```

### 模板继承
插件可以通过 `extends` 字段继承系统模板，只修改部分组件：

```json
{
  "templates": [
    {
      "page": "post-detail",
      "component": "EnhancedPostTemplate",
      "extends": "default",
      "priority": 5
    }
  ]
}
```

```tsx
// 继承模板：只修改 Header，其他使用默认
export function EnhancedPostTemplate(props: PostTemplateProps) {
  const DefaultTemplate = useDefaultTemplate('post-detail');

  return (
    <DefaultTemplate.Container>
      {/* 使用自定义 Header */}
      <EnhancedHeader post={props.post} />
      {/* 其他部分使用默认 */}
      <DefaultTemplate.Content {...props} />
      <DefaultTemplate.Sidebar {...props} />
      <DefaultTemplate.Replies {...props} />
      <DefaultTemplate.Footer {...props} />
    </DefaultTemplate.Container>
  );
}
```

---

## 管理后台模板管理

### 功能
| 功能 | 说明 |
|------|------|
| 主题列表 | 查看所有已安装主题 |
| 启用主题 | 一键切换当前主题 |
| 上传主题 | 上传自定义主题包 |
| 预览主题 | 不切换的情况下预览效果 |
| 删除主题 | 移除不需要的主题 |
| 模板编辑 | 在线编辑模板组件代码（高级用户） |

### 主题包格式
```
theme-name-v1.0.0.zip
├── theme.json              # 主题元数据
├── templates/              # 模板组件
│   ├── post-detail.tsx
│   ├── post-list.tsx
│   ├── user-profile.tsx
│   └── ...
├── styles/                 # 主题样式
│   └── custom.css
└── public/                 # 静态资源
    └── images/
```

### theme.json
```json
{
  "name": "Modern Blue",
  "slug": "modern-blue",
  "version": "1.0.0",
  "author": "设计师名",
  "description": "现代化蓝色主题",
  "preview_image": "/preview.png",
  "compatible_version": ">=1.0.0"
}
```

---

## 渲染流程

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  页面请求 │     │Template  │     │ Plugin   │     │ React    │
│          │────▶│Registry  │────▶│Injector  │────▶│ Render   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                     │                  │
                     │ 1. 获取主题      │
                     │ 2. 合并插件覆盖  │
                     │ 3. 返回最终组件  │
                                      │
                                      │ 4. 渲染注入点
                                      │ 5. 返回完整页面
```

### 渲染步骤
1. 页面请求到达
2. TemplateRegistry 检查当前激活主题
3. 查找是否有插件覆盖了该页面模板
4. 合并：系统默认 + 主题覆盖 + 插件覆盖
5. InjectPointManager 收集该页面所有注入点的组件
6. React 渲染最终页面（模板 + 注入组件）

---

## 性能优化

### 模板缓存
- 模板解析结果缓存到内存
- 主题切换时清空缓存
- SSR 预渲染常用模板

### 注入点优化
- 注入点组件懒加载
- 无注入点的页面跳过扫描
- 使用 React.memo 避免重渲染

### 插件隔离
- 插件模板不共享全局状态
- 通过 Props 传递数据
- 样式使用 CSS Modules 避免冲突

---

## 安全考虑

1. **XSS 防护**：插件模板不能直接使用 `dangerouslySetInnerHTML`，需经过系统过滤
2. **样式隔离**：插件样式使用 CSS Modules 或 Scoped CSS
3. **数据访问**：插件只能通过 Props 获取数据，不能直接访问 API
4. **恶意检测**：上传主题时进行代码审计检查

---

## 未来扩展

| 功能 | 说明 |
|------|------|
| 可视化模板编辑器 | 拖拽式页面构建器 |
| A/B 测试 | 同时运行多个模板，测试效果 |
| 模板市场 | 下载社区制作的模板 |
| 动态模板加载 | 按条件动态加载不同模板 |
| 模板版本管理 | 模板版本回滚功能 |
