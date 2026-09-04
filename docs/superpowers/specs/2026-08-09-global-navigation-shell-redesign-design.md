# 全站导航壳重构设计

## 背景

MindFourm 当前非 admin 页面已经统一经过 `frontend/src/components/layout/site-shell.tsx`，但导航体系仍然分散在多套实现里：

- `SiteShell + UnifiedHeader + TopNavigationMenu` 提供顶部主导航
- `frontend/src/components/forum/sidebar.tsx + forum-content-layout.tsx` 提供论坛页桌面侧栏
- `frontend/src/components/layout/mobile-nav-menu.tsx` 提供移动菜单
- `frontend/src/components/layout/sidebar.tsx` 仅在资源详情页使用，且包含过时品牌、硬编码用户信息、未定义设计 token 和不存在的部分路由

这导致几个实际问题：

1. 同一站点存在三套以上导航来源和渲染方式，信息架构难以维护。
2. 论坛首页/分类页、资源页、消息/通知页的外层壳体验不一致。
3. `md ~ lg` 区间存在导航断档：桌面顶部导航要到 `lg` 才显示，但移动菜单在 `md` 就隐藏。
4. `login / register / callback / accept-terms` 与内容页共用同壳，不利于流程型页面保持轻量。
5. 资源详情页当前接入的 `layout/sidebar.tsx` 与现有设计系统、真实路由和站点品牌都不一致。

本次工作不是单独美化资源页，而是把非 admin 页面的导航结构升级为统一的“左侧主导航 + 顶部工具栏 + 内容区”壳层，并保留 MindFourm 现有主题变量和组件气质。

## 目标

- 为内容/功能页建立统一的全站导航壳，桌面端以左侧 Sidebar 作为唯一主导航。
- 将移动端同步重构为与桌面共用数据源的抽屉导航。
- 将流程型认证页面从主站内容壳中拆出，保留轻量独立布局。
- 继续复用后台可配置 `settings.top_navigation_items`，不把主导航退回为纯前端硬编码。
- 吸收现有论坛侧栏和移动菜单中的有效能力，消除导航分叉。
- 保持 admin 独立布局不受影响。

## 范围外

- 不重做 admin 布局。
- 不重新设计站点主题变量、品牌色体系或全站卡片视觉规范。
- 不改变资源页、帖子页、消息页等业务组件的数据获取方式，除非它们依赖的旧导航容器被替换。
- 不在这次改造里做新的业务功能（如新通知类型、额外快捷操作业务逻辑、资源新接口）。
- 不处理后端认证中间件路径缺口本身，但设计需兼容未来补齐。

## 设计原则

### 1. 结构向 `mcae.cn` 学，视觉延续 MindFourm

- 学习对象是布局层级和导航组织方式，而不是照搬视觉皮肤。
- 继续使用 `shared-styles/variables.css`、`globals.css`、`buildBrandCssVariables()` 所定义的现有 token 和品牌变量。
- 新壳组件必须只使用当前有效 token，例如 `--bg`、`--bg-card`、`--bg-elevated`、`--text`、`--text-secondary`、`--text-muted`、`--border`、`--primary`、`--primary-soft`，不得引入 `--bg-secondary`、`--bg-tertiary` 这类未定义变量。

### 2. 导航模型先统一，渲染器后分端

- 不再让桌面顶部导航、桌面侧栏和移动菜单各自维护一套导航逻辑。
- 先形成一个统一 `SiteNavigationModel`，再分别渲染为：
  - 桌面左侧 Sidebar
  - 移动 Drawer
  - 顶部工具栏中的最小必要工具项

### 3. 页面上下文导航不再冒充全站主导航

- 论坛分类、热门标签、资源分类树、资源热点、页面右侧信息块继续存在，但它们属于业务页面自身的上下文导航或补充信息。
- 这些上下文区块可以在新壳下继续出现，但不再承担“全站主导航”职责。

### 4. 流程页与内容页分壳

- 登录、注册、回调和条款接受页使用轻量流程壳。
- 内容/功能页使用统一内容壳。
- 不再让单个 `SiteShell` 试图同时兼顾流程页与内容页。

## 总体架构

### 壳层拆分

#### 1. `AuthFlowLayout`

服务以下流程型页面：

- `/login`
- `/register`
- `/callback`
- `/accept-terms`

特征：

- 不显示全站左侧 Sidebar
- 不承担站内内容导航职责
- 保持轻量、聚焦、低干扰
- 保留必要品牌识别与返回路径处理

#### 2. `ContentShellLayout`

服务绝大多数 `(public) + (auth)` 内容/功能页，例如：

- 首页 `/`
- 分类页 `/categories/[id]`
- 帖子详情 `/posts/[id]`
- 资源列表 `/resources`
- 资源详情 `/resources/[id]`
- 通知 `/notifications`
- 私信 `/messages`
- 书签 `/bookmarks`
- 设置 `/settings`
- 好友 `/friends`
- 个人资料编辑 `/users/me/edit`
- LANLink 页面 `/lanlink`、`/lanlink/quick-code`

特征：

- 桌面端：左侧 Sidebar + 顶部工具栏 + 主内容区
- 移动端：顶部工具栏 + Drawer 导航 + 主内容区
- 作为非 admin 页面统一外壳

#### 3. `AdminLayout`

- 继续保留现有 admin 专属布局、`AdminGuard`、`AdminSidebar` 和 `AdminHeader`
- 不进入本次导航壳统一

## 导航模型

### 统一模型：`SiteNavigationModel`

为避免现在“顶部导航、论坛侧栏、移动菜单、资源实验侧栏”四处分叉，建立统一导航模型，概念上包含以下字段：

- `primaryItems`：全站一级主入口
- `groups`：可展开分组（如发现、社区扩展）
- `personalItems`：与当前用户相关的功能入口
- `quickActions`：发布、提交资源、签到等快捷操作
- `contextPanels`：可选的页面上下文插槽定义（由页面决定是否渲染）

### 数据来源

#### Source A：后台配置导航

继续以 `settings.top_navigation_items` 作为全站主导航基础来源：

- 保留后台对导航结构的可配置能力
- 继续沿用现有 `parseTopNavigationItems()` 与 `filterTopNavigationItemsBySettings()` 的思想
- 保留 feature flag 对导航显示的裁剪能力

#### Source B：系统固定入口

以下能力不依赖后台自由配置，而由壳层固定提供：

- 通知
- 私信
- 书签
- 设置
- 好友
- 我的内容相关入口
- 发帖 / 发资源 / 签到 等快捷操作
- 用户身份区（头像、用户名、角色或等级展示）

这些入口应与当前登录状态、权限和 feature flag 联动，但不交由后台任意改变其存在性。

#### Source C：页面上下文导航

以下能力不进入全站主导航模型，而作为页面上下文存在：

- 论坛分类树
- 热门标签
- 资源分类树
- 资源热点与统计侧栏
- 页面级右侧信息卡
- LANLink 局部 tab 导航

规则：

- 它们继续由各页面/子布局控制
- 允许在 `ContentShellLayout` 的主内容区中出现
- 不进入主 Sidebar 的一级导航职责

## 桌面端设计

### 左侧 Sidebar 的角色

桌面端 Sidebar 是唯一主导航中枢，负责：

- 站点主入口导航
- 可展开分组导航
- 用户功能导航
- 快捷操作
- 用户身份信息

它不负责：

- 渲染页面业务内容
- 替代资源页右侧统计区
- 替代论坛分类上下文
- 替代页面自身的 breadcrumb、tab、局部过滤器

### 顶部 Header 的角色

顶部 `UnifiedHeader` 从“顶部主导航”降级为“顶部工具栏”。

保留：

- 搜索
- 消息图标与未读数
- 通知图标与未读数
- 好友请求图标与未读数
- 用户菜单 / 用户入口
- 主题切换
- 必要的管理员入口
- 移动端菜单按钮

移除其主导航职责：

- 不再承载首页 / 社区 / 资源 / 联机大厅等主导航链接
- 不再依赖 `TopNavigationMenu` 作为桌面端主入口渲染器

说明：

- `UnifiedHeader` 可以继续被复用，但传入的 slot 需要减少或替换
- 若继续使用该组件，应让其更明确地区分“工具项”和“导航项”

### 内容区布局

`ContentShellLayout` 的主区域结构：

- 左侧固定或 sticky Sidebar
- 右侧为垂直栈：工具栏 + 主内容
- 主内容页继续自行决定：
  - 单栏
  - 双栏
  - 三栏
  - tab 布局
  - 右侧信息栏

换句话说，外壳只统一第一层骨架，不扁平化所有业务页布局。

## 移动端设计

### Drawer 取代独立 mobile-nav-menu 逻辑

移动端导航采用 Drawer / 覆盖菜单，和桌面 Sidebar 共用 `SiteNavigationModel`。

结果：

- 不再维护 `mobile-nav-menu.tsx` 自己的一套导航装配逻辑
- 顶部工具栏保留汉堡按钮
- 点击后展开抽屉，显示与桌面一致的信息架构

### 断档修复

当前存在：

- `TopNavigationMenu` 在 `lg` 以上才显示
- 移动按钮和菜单在 `md` 就隐藏

新设计要求：

- 统一 breakpoint 逻辑，确保 `md ~ lg` 宽度始终有可用导航路径
- Drawer 的可用区间必须覆盖所有非桌面宽度
- 不允许再出现“平板宽度无主导航入口”的状态

### 移动端信息密度

移动 Drawer 渲染：

- 主入口优先
- 分组可折叠
- 我的功能区合并在中下部
- 快捷操作放在底部或吸附区
- 保持单手操作可达性

## 现有组件的迁移策略

### `frontend/src/components/layout/site-shell.tsx`

当前职责：

- 统一头部、公告、主内容和页脚
- 管理搜索、SSE、未读计数、登录注册链接、移动菜单状态

迁移方向：

- 重写或拆分为新的 `ContentShellLayout` 核心实现
- 保留其中可复用的状态逻辑：
  - auth / settings 获取
  - unread message count
  - unread friend request count
  - SSE 刷新逻辑
  - 搜索跳转逻辑
  - MindAuth 登录/注册 URL 构建逻辑
- 移除其对旧桌面顶部导航结构的依赖

### `frontend/src/components/layout/mobile-nav-menu.tsx`

迁移方向：

- 逐步废弃独立装配逻辑
- 其可复用的“移动端渲染经验”和部分分组/去重逻辑可迁入统一导航模型层
- 最终不再作为单独“第二套导航系统”存在

### `frontend/src/components/forum/sidebar.tsx`

迁移方向：

- 不再作为全站主侧栏继续存在
- 其中有效能力拆分为：
  - 进入统一导航模型的能力（若属于全站导航）
  - 继续保留为页面上下文侧栏的能力（分类、标签、页面专属辅助信息）
- 首页与分类页不再依赖 `forum-content-layout.tsx` 来获得“主导航”

### `frontend/src/components/forum/forum-content-layout.tsx`

迁移方向：

- 失去“提供全站左侧主栏”的职责
- 若仍需要，可保留为论坛页内部上下文布局容器
- 否则由页面直接在 `ContentShellLayout` 下定义局部双栏结构

### `frontend/src/components/layout/sidebar.tsx`

迁移方向：

- 不直接沿用当前实现
- 原因：
  - 含 `MineAPK` 等错误品牌
  - 有硬编码用户信息 `xyc`
  - 使用未定义 token
  - 包含不存在或不准确的路由
  - 当前动作按钮无真实行为
- 这份实现只能作为视觉草图参考，不能作为正式组件基础

### `frontend/src/lib/shared/components/UnifiedHeader.tsx`

迁移方向：

- 继续保留组件本体的可能性较高
- 但在新壳中改为工具栏用途
- 桌面主导航 slot 应移除或默认关闭
- 需要确保：
  - 搜索输入与工具图标布局在“有左侧导航”的前提下仍然协调
  - 移动端按钮与 Drawer 行为统一
  - 发帖按钮逻辑要么正确接线，要么显式移出壳层

## 页面级落地规则

### 首页 `/`

- 不再依赖当前论坛左侧栏承担主导航
- 首页自己的分类/标签/快速入口可降级为页面上下文区块
- 顶部 hero、统计、帖子列表继续由页面自身控制

### 分类页 `/categories/[id]`

- 主导航由壳层统一提供
- 分类上下文保留为页面级辅助导航
- 不强制保留当前 `forum-content-layout.tsx` 结构，只保留其必要信息层级

### 帖子详情 `/posts/[id]`

- 使用统一内容壳
- 保留现有 breadcrumb、帖子内容、回复树、回复表单结构
- 不额外引入论坛旧侧栏作为主导航

### 资源列表 `/resources`

- 保留资源页自己的三栏内容布局思想：
  - 左侧资源分类树
  - 中间列表与筛选
  - 右侧热点/统计
- 但这三栏位于 `ContentShellLayout` 的主内容区之内
- 资源分类树和右侧栏属于页面上下文，不上升为全站主导航

### 资源详情 `/resources/[id]`

- 移除对当前 `frontend/src/components/layout/sidebar.tsx` 的直接依赖
- 统一改为在 `ContentShellLayout` 下渲染资源详情主内容
- 保留资源详情页内部 tabs、评论和右侧信息栏
- 如需页面上下文侧栏，应使用新的页面级上下文结构，而不是旧实验性侧栏

### 通知 / 消息 / 书签 / 设置 / 好友 等功能页

- 全部进入 `ContentShellLayout`
- 这些页不再显得像“顶部壳的附属页面”，而是成为统一内容站的一部分
- 其中用户相关入口在主 Sidebar 中有稳定位置

### LANLink 页

- 仍然使用统一内容壳
- 保留 `lanlink/layout.tsx` 的局部 tab 结构
- 局部 tab 属于页面内部导航，不替代全站主导航

## 错误处理与状态规则

- `ContentShellLayout` 不引入新的全局 loading skeleton 协议，继续遵循页面自身已有的异步状态模式。
- 若导航配置为空、解析失败或被 feature flag 全部裁掉，壳层必须仍然能渲染最小导航骨架，不允许出现空白左栏。
- 未登录用户看到的 Sidebar 必须按匿名状态裁剪：
  - 隐藏需要登录的“我的功能”项
  - 保留公开主入口
  - 快捷操作根据登录状态替换为登录/注册引导或公开入口
- 若功能开关关闭（如资源、联机大厅、群组、排行榜、商店），对应导航项必须自动消失，不显示死链。
- Drawer 打开时要锁定背景滚动，关闭时恢复。
- 页面切换后 Drawer 必须自动关闭。

## 可测试性与验证要求

### 结构验证

- 登录流程页不显示全站 Sidebar。
- 内容页统一显示 Sidebar + 工具栏。
- admin 页不受本次重构影响。

### 导航验证

- 后台配置导航能正确映射到 Sidebar 和移动 Drawer。
- feature flag 能同时裁剪桌面与移动导航。
- 未登录 / 已登录 / 管理员三种状态下导航项正确变化。
- `md ~ lg` 宽度有可用导航入口，不再断档。

### 页面兼容验证

- 首页、分类页、帖子详情、资源列表、资源详情在新壳下无布局溢出。
- 通知、消息、书签、设置、好友等功能页在新壳下不丢失现有交互。
- 资源列表的三栏结构和资源详情的 tabs/评论结构在新壳下不重复嵌套、不出现双侧栏冲突。

### 视觉验证

- 新 Sidebar 使用当前主题 token，亮暗色下均可读。
- 不再出现 `MineAPK`、硬编码用户、未定义 token 或错误路由。
- 顶部工具栏明显弱化为工具区，而非第二主导航。

## 分批实施建议

1. **壳层分离**
   - 明确 `AuthFlowLayout` 与 `ContentShellLayout` 的页面边界
   - 调整非 admin 页面布局入口

2. **统一导航模型**
   - 抽取 `SiteNavigationModel`
   - 复用后台导航配置与 feature flag 过滤能力
   - 合并固定用户功能与快捷操作

3. **桌面 Sidebar 落地**
   - 实现新的桌面 Sidebar
   - 将 `UnifiedHeader` 降级为工具栏
   - 接入 unread counts、搜索、用户信息

4. **移动 Drawer 落地**
   - 用统一模型重构移动导航
   - 清除 `md ~ lg` 导航断档

5. **页面迁移与旧实现下线**
   - 首页/分类页脱离旧 forum 主侧栏依赖
   - 资源详情移除实验性 `layout/sidebar.tsx`
   - 评估并缩减 `forum-content-layout.tsx` 与 `mobile-nav-menu.tsx` 的职责

6. **兼容与回归验证**
   - 页面布局回归
   - 登录状态 / feature flag 回归
   - 响应式回归

## 验收重点

- 全站内容/功能页统一进入新的导航壳，登录流程页保留轻量独立布局。
- 桌面端 Sidebar 成为唯一主导航，顶部 Header 成为工具栏。
- 导航配置、系统固定入口和移动 Drawer 不再各自维护独立信息架构。
- 论坛旧主侧栏与资源实验侧栏不再承担全站主导航职责。
- `md ~ lg` 导航断档被修复。
- 资源列表、资源详情、帖子详情、消息和设置页在新壳下保持可用且布局稳定。
- 不引入错误品牌、假数据、未定义 token 或死链导航项。
