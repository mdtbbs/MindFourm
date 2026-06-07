# UI/UX 设计规范

> 本文档记录了论坛系统的 UI/UX 设计规范。
> 创建时间: 2026-06-07

## 设计系统

| 项目 | 规范 |
|------|------|
| 基础组件 | shadcn/ui |
| 动画组件 | Magic UI + Framer Motion |
| 样式框架 | Tailwind CSS |
| 主题 | 浅色/深色跟随系统切换 |

---

## 品牌色

| 颜色 | 值 | 用途 |
|------|------|------|
| 主色（浅蓝） | `#3b82f6` | 按钮、链接、高亮 |
| 深色（深蓝） | `#1e3a5f` | 导航栏、侧边栏、标题 |
| 辅助色 | `#60a5fa` | 悬停、次级按钮 |
| 成功 | `#22c55e` | 成功提示、通过状态 |
| 警告 | `#f59e0b` | 警告提示、待处理状态 |
| 错误 | `#ef4444` | 错误提示、删除操作 |
| 信息 | `#06b6d4` | 信息提示 |

---

## 主题配置

### 浅色模式（Light）
```css
:root {
  --background: #ffffff;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --accent: #f1f5f9;
  --accent-foreground: #0f172a;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #3b82f6;
}
```

### 深色模式（Dark）
```css
[data-theme="dark"] {
  --background: #0f172a;
  --foreground: #f8fafc;
  --card: #1e293b;
  --card-foreground: #f8fafc;
  --popover: #1e293b;
  --popover-foreground: #f8fafc;
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
  --secondary: #1e293b;
  --secondary-foreground: #f8fafc;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --accent: #1e293b;
  --accent-foreground: #f8fafc;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #334155;
  --input: #334155;
  --ring: #3b82f6;
}
```

### 主题切换
- 默认跟随系统（`prefers-color-scheme`）
- 用户可手动覆盖为浅色/深色
- 切换时添加过渡动画（200ms）

---

## 字体

| 用途 | 字体 | 大小 | 字重 |
|------|------|------|------|
| 正文 | system-ui, sans-serif | 14px / 16px | 400 |
| 标题 H1 | system-ui, sans-serif | 32px | 700 |
| 标题 H2 | system-ui, sans-serif | 24px | 600 |
| 标题 H3 | system-ui, sans-serif | 20px | 600 |
| 标题 H4 | system-ui, sans-serif | 18px | 600 |
| 按钮 | system-ui, sans-serif | 14px | 500 |
| 标签 | system-ui, sans-serif | 12px | 500 |
| 代码 | JetBrains Mono, monospace | 14px | 400 |

---

## 间距系统

基于 4px 网格：

| Token | 值 | 用途 |
|-------|------|------|
| `gap-1` | 4px | 紧密元素间距 |
| `gap-2` | 8px | 组件内元素 |
| `gap-3` | 12px | 相关元素 |
| `gap-4` | 16px | 组件间距 |
| `gap-6` | 24px | 区块间距 |
| `gap-8` | 32px | 大区块间距 |

---

## 圆角

| Token | 值 | 用途 |
|-------|------|------|
| `rounded-sm` | 2px | 小元素 |
| `rounded` | 4px | 按钮、输入框 |
| `rounded-md` | 6px | 卡片、对话框 |
| `rounded-lg` | 8px | 大卡片 |
| `rounded-xl` | 12px | 弹窗 |
| `rounded-full` | 9999px | 头像、徽章 |

---

## 阴影

| Token | 用途 |
|-------|------|
| `shadow-sm` | 输入框聚焦 |
| `shadow` | 卡片悬停 |
| `shadow-md` | 下拉菜单、对话框 |
| `shadow-lg` | 弹窗、通知 |

---

## 组件规范

### 按钮

| 类型 | 样式 | 用途 |
|------|------|------|
| Primary | 蓝色背景 + 白色文字 | 主要操作 |
| Secondary | 白色背景 + 蓝色边框 | 次要操作 |
| Ghost | 透明背景 + 蓝色文字 | 链接式操作 |
| Danger | 红色背景 + 白色文字 | 删除/危险操作 |
| Icon | 图标按钮 | 工具栏操作 |

### 卡片

- 背景色：`--card`
- 边框：1px `--border`
- 圆角：`rounded-md`
- 内边距：`p-4` / `p-6`
- 悬停时添加 `shadow`

### 输入框

- 高度：40px
- 边框：1px `--input`
- 圆角：`rounded`
- 聚焦时显示 `ring-2 ring-primary`
- 错误状态显示红色边框

### 表格

- 表头：灰色背景 `--muted`
- 行：悬停时 `--accent` 背景
- 边框：底部分隔线
- 分页：底部居中

### 对话框/弹窗

- 背景：`--popover`
- 阴影：`shadow-lg`
- 圆角：`rounded-xl`
- 遮罩层：半透明黑色 `bg-black/50`
- 动画：从中心缩放进入（Framer Motion）

### 徽章/标签

- 小尺寸：高度 20px，圆角 `rounded-full`
- 颜色：根据类型（成功=绿，警告=黄，错误=红，信息=蓝）
- 文字：12px，500 字重

---

## 动画规范

### 原则
- 默认简洁克制（200-400ms）
- 使用缓动曲线 `ease-in-out`
- 不过度花哨，不影响可读性
- 用户可选择关闭动画

### 常用动画

| 场景 | 动画 | 时长 | 缓动 |
|------|------|------|------|
| 页面切换 | Fade in + slide up | 300ms | ease-out |
| 按钮悬停 | 背景色过渡 | 200ms | ease-in-out |
| 卡片悬停 | 阴影增加 + 微上移 | 200ms | ease-out |
| 列表加载 | Fade in（逐项延迟 50ms） | 300ms | ease-out |
| 对话框 | Scale in + fade | 200ms | ease-out |
| Toast 通知 | Slide in from right | 300ms | ease-out |
| 加载骨架屏 | Shimmer 效果 | 1.5s 循环 | linear |

### Magic UI 组件使用指南

| 组件 | 使用场景 | 注意事项 |
|------|----------|----------|
| `Hero` | 首页品牌展示 | 保持简洁，不过度动画 |
| `AnimatedList` | 帖子列表加载 | 逐项延迟不超过 50ms |
| `FadeText` | 标题文字 | 仅用于重要文字 |
| `Marquee` | 热帖滚动 | 速度适中，可暂停 |
| `Avatar` | 用户头像 | 呼吸光效果可选 |
| `Toast` | 通知推送 | 动画简洁 |
| `Shimmer` | 加载状态 | 统一使用 |
| `GlowEffect` | 登录页品牌 | 适度使用 |
| `AnimatedBeam` | 关注关系 | 仅用户详情页 |

---

## 响应式设计

| 断点 | 设备 | 布局调整 |
|------|------|----------|
| `< 640px` | 手机 | 单列，隐藏侧边栏 |
| `640px - 1024px` | 平板 | 双列，折叠侧边栏 |
| `> 1024px` | 桌面 | 多列，完整布局 |

---

## 无障碍设计（Accessibility）

| 项目 | 要求 |
|------|------|
| 对比度 | 文字与背景对比度 ≥ 4.5:1 |
| 键盘导航 | 所有交互支持 Tab 键 |
| 屏幕阅读器 | 所有图标添加 `aria-label` |
| 焦点指示 | 清晰的焦点环（`ring-2`） |
| 颜色依赖 | 重要信息不仅依赖颜色 |
| 动画 | 支持 `prefers-reduced-motion` |

---

## 页面布局规范

### 首页
- Hero 区域（品牌标语）
- 热帖 Marquee 滚动
- 分类入口
- 最新帖子列表

### 帖子列表页
- 顶部筛选栏（最新/最热/精华）
- 帖子卡片列表
- 底部分页

### 帖子详情页
- 帖子标题 + 作者信息
- 帖子正文（Markdown 渲染）
- 手动目录（侧边栏）
- 投票区（如有）
- 回复列表（分页，每页 20 条）
- 回复输入框

### 用户资料页
- 主页背景 + 头像 + 昵称 + 称号
- 徽章展示
- 统计数据（发帖/回复/获赞/积分排名）
- 动态列表

### 管理后台
- 侧边栏导航
- 数据仪表盘（统计卡片 + 趋势图）
- 数据表格（排序、筛选、分页）
