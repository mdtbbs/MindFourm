# 前端异步状态统一设计

## 背景

MindFourm 当前高频页面的加载、空数据和请求失败状态不一致：部分页面只显示 `Loading...`，部分请求失败会静默回退为空列表，部分列表没有重试入口。用户无法区分“确实没有数据”和“请求失败”，刷新过程中也容易出现整页闪烁。

## 目标

第一阶段统一高频页面的异步状态体验：

- 首页
- 帖子列表、帖子详情、新建帖子
- 资源列表、资源详情、加载更多
- 搜索
- 消息列表和会话
- 通知
- 管理后台帖子、用户、分类、资源、通知、内容审核列表

不修改后端 API、不改变 API 响应结构，只改善前端状态呈现、重试和加载体验。

## 采用方案

采用“统一组件 + 高频页面改造”：

- 新增共享 `StatePanel`，统一图标、标题、说明和操作按钮布局
- 新增 `EmptyState` 和 `ErrorState` 包装器，保持页面调用语义清晰
- 新增基础 `Skeleton`/`InlineLoading` 原语；帖子详情、帖子列表继续复用已有专用 skeleton
- 所有首次请求遵循 `loading -> error -> empty -> data` 状态优先级
- 刷新已有数据时保留旧内容，仅显示局部 loading，避免回退到空状态
- 所有可恢复的请求错误提供明确的重试按钮
- 详情页区分 `notFound()`（资源不存在）与请求错误（可重试）
- 所有新增和替换文案使用中文，沿用现有 CSS variables、surface tokens 和图标库

## 组件设计

建议文件：

- `frontend/src/components/ui/state-panel.tsx`
- `frontend/src/components/ui/empty-state.tsx`
- `frontend/src/components/ui/error-state.tsx`
- `frontend/src/components/ui/inline-loading.tsx`
- `frontend/src/components/ui/skeleton.tsx`

`StatePanel` 接收：

```typescript
type StatePanelProps = {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void; href?: string };
  secondaryAction?: { label: string; onClick?: () => void; href?: string };
  className?: string;
};
```

`ErrorState` 默认提供重试动作，调用方传入 `onRetry`；如果页面不支持重试，则明确传入无动作状态。`EmptyState` 支持 CTA，以便首页、资源页、消息页引导用户继续操作。

组件必须：

- 使用 `role="status"` 或 `role="alert"` 适合的语义
- 保持稳定的最小高度，避免状态切换造成布局跳动
- 使用 lucide 图标和现有颜色变量
- 不引入新依赖
- 不把页面业务文案硬编码到共享组件

## 页面行为

### 首次加载

显示页面相应 skeleton；没有专用 skeleton 的页面使用统一 `InlineLoading` 或 `StatePanel` loading 变体。

### 请求失败

保留错误状态，不把错误转换成空数组。错误状态至少包含：

- 中文标题
- 简短说明
- “重试”按钮

### 空数据

只有请求成功且数据为空时显示空状态。根据上下文区分：

- 搜索未输入关键词
- 搜索无匹配结果
- 首页暂无帖子
- 资源列表为空
- 消息为空
- 通知按筛选条件为空
- 管理列表当前筛选下无数据

### 分页/加载更多

初始数据成功后，加载更多失败显示局部错误和重试，不清除已有数据。提交或刷新时保留旧列表，并显示按钮或行级 loading。

### 详情页

服务返回明确不存在时继续使用 `notFound()`；网络/API 错误使用可重试 ErrorState。回复、资源版本等子列表错误不应遮蔽已经加载成功的主体内容。

## 路由 loading 边界

为高频 segment 增加轻量 `loading.tsx`，优先覆盖：

- `frontend/src/app/(public)/loading.tsx`
- `frontend/src/app/(public)/posts/loading.tsx`
- `frontend/src/app/(public)/resources/loading.tsx`
- `frontend/src/app/(public)/search/loading.tsx`
- `frontend/src/app/(public)/messages/loading.tsx`
- `frontend/src/app/admin/loading.tsx`

沿用现有 `(auth)/loading.tsx` 的 PageLoader，不重复造全屏 loader。详情页仅在专用 skeleton 能明显改善体验时增加边界。

## 分批实施

1. 共享状态组件和 skeleton 原语
2. 首页、帖子、资源、搜索
3. 消息和通知
4. 管理后台列表
5. 测试、Playwright 场景和全站扫描

每批独立 commit，避免一次性修改所有页面导致 review 困难。

## 验证

每批执行：

```bash
cd frontend
npx tsc --noEmit
npm run build
```

手动或 Playwright 覆盖：

- 正常数据
- 成功但空数据
- API 失败
- 点击重试后恢复
- 加载更多失败但已有数据保留
- 筛选条件变化后的空状态
- 移动端和桌面端不发生布局溢出

检查目标：任何高频页面都不再用空数组掩盖请求失败，不再出现无上下文的英文 `Loading...`，并且错误状态具备可恢复路径。

## 不在范围内

- 不修改后端 API 或数据库
- 不实现反馈、投票、群聊或插件前端注入
- 不重做整体视觉设计
- 不把所有页面一次性重构为同一个大组件
- 不删除现有专用 skeleton；只在其上统一状态语义
