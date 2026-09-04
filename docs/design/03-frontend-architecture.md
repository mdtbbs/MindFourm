# 前端架构设计

> 本文档记录了论坛系统的前端架构设计方案。
> 创建时间: 2026-06-07

## 技术选型

| 项目 | 选择 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| UI 库 | React 18 |
| 类型 | TypeScript |
| 基础组件 | shadcn/ui |
| 动画组件 | Magic UI + Framer Motion |
| 状态管理 | Zustand |
| 数据请求 | TanStack React Query |
| 富文本 | Editor.js |
| 样式 | Tailwind CSS |
| 国际化 | 仅中文（预留扩展） |

---

## 目录结构

```
frontend/
├── src/
│   ├── app/
│   │   ├── (public)/              # 公开页面
│   │   │   ├── page.tsx           # 首页（Hero + Marquee 热帖）
│   │   │   ├── posts/
│   │   │   │   ├── page.tsx       # 帖子列表（AnimatedList）
│   │   │   │   ├── [id]/page.tsx  # 帖子详情（Shimmer 加载）
│   │   │   │   └── new/page.tsx   # 发帖（Editor.js）
│   │   │   ├── categories/[slug]/page.tsx
│   │   │   ├── tags/[slug]/page.tsx
│   │   │   ├── users/[id]/page.tsx  # 用户资料（Avatar + 徽章）
│   │   │   └── search/page.tsx
│   │   │
│   │   ├── (auth)/                 # 登录页面组
│   │   │   ├── login/page.tsx      # 登录（GlowEffect + InteractiveGrid）
│   │   │   ├── callback/page.tsx
│   │   │   ├── notifications/page.tsx  # 通知中心（Toast 动画）
│   │   │   ├── messages/page.tsx
│   │   │   ├── bookmarks/page.tsx
│   │   │   └── settings/page.tsx
│   │   │
│   │   ├── admin/                  # 管理后台
│   │   │   ├── page.tsx            # 仪表盘（StatCard 动画）
│   │   │   ├── users/page.tsx
│   │   │   ├── posts/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── settings/
│   │   │   ├── announcements/
│   │   │   ├── sensitive-words/
│   │   │   ├── levels/
│   │   │   ├── groups/
│   │   │   ├── shop/
│   │   │   └── plugins/
│   │   │
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui 基础组件
│   │   ├── magic/                  # Magic UI 动画组件
│   │   │   ├── hero.tsx
│   │   │   ├── animated-list.tsx
│   │   │   ├── fade-text.tsx
│   │   │   ├── marquee.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── shimmer.tsx
│   │   │   ├── glow-effect.tsx
│   │   │   └── animated-beam.tsx
│   │   ├── layout/                 # 布局组件
│   │   ├── post/                   # 帖子组件
│   │   ├── reply/                  # 回复组件
│   │   ├── user/                   # 用户组件
│   │   ├── notification/           # 通知组件
│   │   └── admin/                  # 管理后台组件
│   │
│   ├── hooks/
│   │   ├── use-sse.ts              # SSE 连接
│   │   ├── use-notification.ts
│   │   └── use-poll.ts
│   │
│   ├── lib/
│   │   ├── api/                    # API 客户端
│   │   ├── sse.ts                  # SSE 工具
│   │   └── utils.ts
│   │
│   ├── store/                      # Zustand 状态管理
│   │   ├── user-store.ts
│   │   ├── notification-store.ts
│   │   └── online-store.ts
│   │
│   └── types/                      # 类型定义
│
├── public/images/
├── next.config.js
├── tailwind.config.js
├── package.json
└── tsconfig.json
```

---

## Magic UI 组件应用映射

| 页面 | 组件 | 效果 |
|------|------|------|
| 首页 | Hero + Marquee | 品牌展示 + 热帖滚动 |
| 帖子列表 | AnimatedList + FadeText | 平滑加载动画 |
| 帖子详情 | Shimmer | 骨架屏加载效果 |
| 用户资料 | Avatar + AnimatedBeam | 头像呼吸光 + 关注关系 |
| 通知中心 | Toast + AnimatedTooltip | 推送通知动画 |
| 登录页 | GlowEffect + InteractiveGrid | 品牌展示 |
| 搜索页 | AnimatedShinyText | 搜索框高亮 |
| 管理后台 | StatCard + DataTable | 数据面板动画 |
| 加载状态 | Shimmer + DotLoading | 统一加载效果 |

---

## 状态管理 (Zustand)

### user-store
- 当前用户信息
- 登录状态
- 积分/徽章/声望更新

### notification-store
- 通知列表
- 未读数量
- SSE 实时添加通知

### online-store
- 在线用户集合
- 在线数量

---

## SSE 客户端

```typescript
// hooks/use-sse.ts
export function useSse<T>(eventType: string, callback: (data: T) => void) {
  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/notifications/events`);
    
    eventSource.addEventListener(eventType, (event) => {
      callback(JSON.parse(event.data));
    });
    
    eventSource.onerror = () => {
      // 自动重连
    };
    
    return () => eventSource.close();
  }, [eventType, callback]);
}
```

---

## 与 shadcn/ui 配合原则

- shadcn/ui：基础交互组件（Button, Dialog, Input, Tabs 等）
- Magic UI：视觉动效（页面过渡、加载动画、数据展示特效）
- 两者基于 Tailwind CSS，样式天然兼容
- 通过 `data-theme="dark"` 实现深色模式
