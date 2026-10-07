# MDTBBS Frontend IA 2.0 — 现状审计

审计范围：`frontend/src/app/**` 中的 Next.js 页面、公共/auth/admin layout、全局壳层、共享导航、搜索、创建、个人与 Resource Center 入口。审计基于当前工作树代码，不推断生产配置或外部客户端行为。

## 当前壳层与入口调用链

| 区域 | 当前实现 | 入口与层级 | 问题 / IA 归属 |
| --- | --- | --- | --- |
| 根 layout | `app/layout.tsx` 提供主题、auth、settings、i18n、navigation context | 所有 route | 保留；不做业务导航 |
| Public/Auth layout | 都包装同一 `SiteShell` / `ContentShell`；Admin 有单独 `AdminShell` | auth 与 public 最终同壳层 | 保留 public shell 与 admin 边界 |
| Desktop sidebar | `ContentSidebar → ContentNavigation → buildContentNavigation`；按 `/resources` 在论坛菜单和资源菜单间切换 | 一级侧栏混合首页、搜索、配置菜单、分类、资源类型、发现和账户链接；侧栏还有当前区 CTA | 两套菜单互换，非六空间模型；改为固定：首页、社区、资源、联机、工具、我的。二级菜单归属页面 |
| Mobile drawer | `ContentDrawer` 复用 `ContentNavigation`，仍显示同一长菜单 | 顶栏汉堡 → 抽屉 | 仅压缩桌面侧栏；由五项底栏取代，保留创建 sheet |
| Mobile bottom nav | 首页、资源、创建、通知/搜索、账号 | 固定底栏 | 与桌面一级 IA 不同，社区和联机缺席；改为：首页、社区、资源、联机、我的；搜索/通知留在顶栏 |
| Topbar | `UnifiedHeader` 有全局搜索输入、发帖按钮、通知下拉、头像菜单 | 桌面可见；移动端搜索 icon 跳 `/search` | 搜索不是 command palette；创建只发帖；开发者中心/我的内容缺席。扩为搜索、`+ 创建`、通知、头像菜单与 breadcrumb |
| 用户菜单 | 个人主页、私信、好友、收藏、管理后台(admin)、设置、退出 | 头像 → 菜单 | 资源、通知、我的内容、Developer Center 缺少一致入口；按用户菜单重新编排 |
| 通知 | `NotificationDropdown` + `/notifications` | 顶栏下拉；旧底栏也给通知固定一格 | 可保留现有未读 API；移动端改为顶栏触达，通知页归 `/me` |
| 首页 | 聚合资源、讨论、公告/新闻等 SSR 数据；有搜索和 Mod/地图/蓝图/服务器快捷链接 | 首页一级 | 已是轻 Dashboard，但编辑器、创建、联机、个人工作区入口弱；保留聚合 API，补快捷入口与空间入口 |
| 搜索 | `/search` 使用 Public V1 `/api/v1/search`，结果包含用户、帖子、资源、服务器等类别 | 顶栏、首页、搜索 icon | 无功能搜索与快捷跳转；新增 Feature Registry Palette，业务结果仍交给现有 unified search |

## Public 与 Auth 页面逐 route 清点

“入口”描述代码中可确认的链接/CTA；“隐藏/孤岛”表示共享导航中无固定入口，不代表全站完全没有深链。

| 当前 route | 页面作用 | 当前入口 / 层级 | 有明显入口 | 隐藏 / 孤岛 | 新 IA | route 调整 / 重复问题 |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 社区与资源首页聚合 | 品牌链接；一级 | 是 | 否 | 首页 | 保留；补工具、联机、创建快捷入口 |
| `/threads` | 最新讨论流 | 论坛侧栏二级、首页 | 是 | 否 | 社区 / 最新 | 保留为内容路由；社区 hub 新增 `/community` |
| `/categories`, `/categories/[id]` | 分类列表与版块帖子流 | 配置侧栏、讨论内容 | 是（依运行设置） | 部分 | 社区 / 分类 | 保留；不再全局一级 |
| `/tags`, `/tags/[slug]` | 标签索引与标签内容 | 配置侧栏/内容 tag 链接 | 是（依设置） | 部分 | 社区 / 标签 | 保留；不再全局一级 |
| `/notices`, `/notices/[id]` | 公告列表与详情 | 默认侧栏设置、首页公告 | 是（不稳定） | 部分 | 社区 / 公告 | 保留；统一由社区入口发现 |
| `/posts/new` | 发主题 | 侧栏 CTA、移动创建 sheet | 是 | 否 | 社区 / 创建菜单 | 保留；新增桌面全局创建菜单 |
| `/posts/[id]` | 主题详情、正文与回复 | 讨论列表、通知、搜索 | 是 | 否 | 社区 / 内容 | 保留 |
| `/posts/[id]/edit` | 编辑主题 | 主题详情所有者操作 | 是（上下文） | 否 | 社区 / 我的内容 | 保留 |
| `/posts/[id]/revisions`, `/posts/[id]/revisions/[revisionId]` | 帖子版本列表与版本查看 | 编辑/详情页次级链接 | 是（上下文） | 部分 | 社区 / 内容历史 | 保留深层内容路由 |
| `/discover` | 资源与讨论发现入口 | Mindustry Club profile 导航；MDTBBS 首页/搜索不可稳定找到 | 否（MDTBBS） | 是（MDTBBS） | 社区 / 推荐 | 保留；作为推荐入口纳入社区 hub |
| `/resources` | Resource Center 列表、筛选、发现 shelves | 固定资源侧栏、首页 | 是 | 否 | 资源 | 保留；一级空间 |
| `/resources/[id]` | 资源详情、下载、收藏、讨论 | 列表、搜索、帖子关联 | 是 | 否 | 资源 / 详情 | 保留；V2 详情行为不变 |
| `/resources/[id]/versions/[versionId]` | 资源不可变版本详情 | 资源详情版本列表 | 是（上下文） | 否 | 资源 / 版本 | 保留 |
| `/resources/[id]/edit` | 资源元数据编辑 | 资源详情操作（所有者/成员） | 是（上下文） | 否 | 我的 / 资源管理 | 保留 |
| `/resources/[id]/workbench` | Resource V2 owner/member 工作台、manifest 与版本流程 | 资源详情/管理链接 | 是（上下文） | 部分 | 资源 / 工作台、工具 | 保留；不拆分 V2 业务逻辑 |
| `/resources/submit` | 新建资源上传 | 资源 CTA、上传选择页、创建入口 | 是 | 否 | 全局创建 / 资源 | 保留 |
| `/resources/submit/map` | 地图资源快速提交 | 上传类型页、移动创建 sheet | 是 | 否 | 全局创建 / 资源 | 保留 |
| `/resources/submit/schematic` | 蓝图资源快速提交 | 上传类型页、移动创建 sheet | 是 | 否 | 全局创建 / 资源 | 保留 |
| `/resources/upload` | 通用上传入口/旧上传流 | 代码内链接不明显 | 否 | 是 | 全局创建 / 资源 | 保留现 route，核对其业务边界后列入路由图 |
| `/search` | 统一内容搜索（帖子、资源、用户、服务器、知识等） | 顶栏输入、首页、移动搜索 icon | 是 | 否 | 全局操作 | 保留；增加 command palette，不替代结果页 |
| `/servers` | 公共服务器列表、我的服务器、申请 | 配置侧栏或搜索；`/apply-server` redirect | 不稳定 | 部分孤岛 | 联机 / 服务器 | 保留 API 与状态 query；在 `/multiplayer` 明确露出 |
| `/servers/apply` | 服务器申请跳转 | 深链接 | 否 | 是 | 联机 / 服务器 | 保留 redirect 行为 |
| `/apply-server` | 兼容申请路由，跳 `/servers?section=apply` | 外链/旧链接 | 否 | 是 | 联机 / 服务器 | 保留现有 redirect |
| `/friends` | 好友、在线状态、Presence、邀请 | 侧栏账户区、头像菜单 | 是（登录后） | 否 | 联机 / 好友；我的 / 快捷入口 | 保留 route，归类为联机能力 |
| `/lanlink`, `/lanlink/quick-code` | 房间/局域网联机流程 | profile/配置侧栏、深链接 | 不稳定 | 部分 | 联机 / 大厅与加入流程 | 保留；按 profile/feature 可用性显示 |
| `/messages`, `/messages/[userId]` | 私信列表与会话 | 头像菜单、登录后侧栏 | 是（但无 IA 归属） | 否 | 我的 / 消息 | 保留；不放进六个一级空间 |
| `/notifications` | 个人通知中心 | 顶栏下拉、旧移动底栏 | 是 | 否 | 我的 / 通知 | 保留 |
| `/bookmarks` | 收藏列表 | 头像菜单、账户侧栏 | 是（登录后） | 否 | 我的 / 收藏 | 保留 |
| `/resources/my` | 我的资源工作台列表 | 资源详情/用户菜单无统一入口 | 不稳定 | 部分孤岛 | 我的 / 我的资源 | 保留业务 route；从 `/me` 明确进入 |
| `/settings` | 用户配置（隐私/通知/账号等） | 用户菜单/侧栏 | 是 | 否 | 我的 / 设置 | 保留；移除产品工具入口 |
| `/settings/blocks` | 屏蔽用户/隐私管理 | 设置页内 | 是（设置二级） | 否 | 我的 / 设置 / 隐私 | 保留 |
| `/settings/cloud-saves` | 用户云存档工具 | 设置页链接 | 是但概念错误 | 否 | 工具 / 云存档 | **删除 route，不做 redirect/兼容**；移到 `/tools/cloud-saves` |
| `/users/[id]` | 公开个人主页、用户内容 | 作者名/头像、头像菜单的本人主页 | 是 | 否 | 我的 / 个人主页；社区 / 用户 | 保留 |
| `/users/me/edit` | 编辑当前用户资料 | 个人主页/账户设置 | 不稳定 | 部分 | 我的 / 资料设置 | 保留 |
| `/developers` | Developer Center / OpenAPI | Mindustry Club 导航；MDTBBS 角色配置为不启用且无头像菜单入口 | 否（MDTBBS） | 是（MDTBBS） | 用户菜单 / 开发者中心 | route 保留；所有普通用户可发现，不依赖 developer 角色 |
| `/about`, `/links`, `/feedback`, `/thanks` | 站点介绍、友情链接、反馈、致谢 | Footer | 是（Footer） | 否 | 帮助/站点信息 | 保留，不进入产品一级 IA |
| `/privacy`, `/terms`, `/community-guidelines`, `/copyright`, `/resource-rules` | 法律、社区与资源规则 | Footer、注册/上传流程 | 是（部分） | 否 | 帮助/政策 | 保留 |
| `/groups`, `/leaderboard`, `/shop` | 用户组、积分排行、积分商店 | 可配置 top/sidebar 导航 | 不稳定 | 部分孤岛 | 社区 / 社区参与 | 保留；社区 hub 列出，尊重 feature flags |
| `/verify-phone`, `/accept-terms`, `/login`, `/register`, `/callback` | 验证与认证流程 | auth redirect/写操作门禁 | 有条件 | 否 | 认证流程 | 保留；不列业务导航 |

## Admin route 清点

Admin 由 `app/admin/layout.tsx → AdminGuard → AdminShell` 单独隔离，后台自己的分组导航保持，不并入普通用户 sidebar。以下 routes 由 AdminShell 的 route registry 分组进入；动态页面由父列表/操作进入。

| 当前 route | 页面作用 | 当前入口 / 层级 | 有明显入口 | 新 IA / 调整 |
| --- | --- | --- | --- | --- |
| `/admin` | 管理概览 | Admin 自身根入口 | 是（有权限） | 头像菜单的“管理后台”进入；普通角色隐藏 |
| `/admin/users`, `/admin/groups`, `/admin/levels`, `/admin/badges`, `/admin/points`, `/admin/shop` | 用户、组、等级、徽章、积分、商店管理 | Admin / 社区配置 | 是（Admin） | Admin 内保持 |
| `/admin/posts`, `/admin/categories`, `/admin/content`, `/admin/content/tags`, `/admin/content/pages`, `/admin/content/pages/[key]`, `/admin/content/reports`, `/admin/content/moderation` | 内容、分类、标签、页面、举报、审核 | Admin / 内容 | 是（Admin） | Admin 内保持 |
| `/admin/resources`, `/admin/resources/analytics`, `/admin/resources/categories`, `/admin/resources/import`, `/admin/resources/merge`, `/admin/resources/moderation` | 资源运维/审核/分析 | Admin / 资源 | 是（Admin） | Admin 内保持，不污染普通用户导航 |
| `/admin/notifications` | 管理通知 | Admin / 系统 | 是（Admin） | Admin 内保持 |
| `/admin/logs`, `/admin/security-access-logs` | 操作与安全审计 | Admin / 安全 | 是（Admin） | Admin 内保持 |
| `/admin/settings`, `/admin/settings/announce`, `/admin/settings/basic`, `/admin/settings/brand`, `/admin/settings/cloud-saves`, `/admin/settings/display`, `/admin/settings/email`, `/admin/settings/external-api`, `/admin/settings/features`, `/admin/settings/footer`, `/admin/settings/moderation`, `/admin/settings/navigation`, `/admin/settings/notifications`, `/admin/settings/seo`, `/admin/settings/sidebar`, `/admin/settings/terms` | 站点设置；其中 cloud-saves 是管理员配置，不是用户云存档 | Admin / 设置 | 是（Admin） | 保留其独立管理语义；不受用户 `/tools/cloud-saves` 移动影响 |
| `/admin/system`, `/admin/system/bans`, `/admin/system/cleanup`, `/admin/system/performance`, `/admin/system/rate-limits`, `/admin/system/rules` | 系统、安全与维护 | Admin / 系统 | 是（Admin） | Admin 内保持 |
| `/admin/plugins` | 插件管理 | Admin / 扩展 | 是（Admin） | Admin 内保持 |

## Layout / 非页面 route

`(public)` 与 `(auth)` layout 都调用同一个 SiteShell。`(auth)/error.tsx`、`(public)/error.tsx`、共享 loading、root/global error、not-found 处理失败态；`/api/internal/revalidate/settings`、`/internal/revalidate/settings`、`/api/revalidate` 是内部/缓存路由，不是用户页面。Admin 的 loading/error/layout 属独立后台壳。

## 关键缺口、重复入口与孤岛结论

1. 一级菜单按历史模块和页面配置生成，资源页/论坛页切换菜单，用户不能形成稳定空间认知。
2. 桌面侧栏和移动底栏不一致；移动创建突出但桌面只有“发帖”，移动导航缺社区、联机。
3. 分类、标签、公告及动态资源类型可挤进侧栏，违反浅层空间导航。
4. `/friends`、`/servers`、`/lanlink` 分属账户/菜单/隐藏分组；无 multiplayer 聚合入口。
5. `/resources/my` 与 V2 工作台能力真实存在，但没有稳定“我的资源”入口。详情和工作台本身保留 V2 的版本、revision、审核、ownership、文件、依赖、同步、renderer 与数据 tabs。
6. 用户云存档是完整产品能力，却错误挂在 `/settings`；将移动到 `/tools/cloud-saves` 且删除旧用户 route。`/admin/settings/cloud-saves` 是不同的站点配置 route，保留。
7. Editor 能力主要由资源详情/workbench 的 renderer 与 map/blueprint tabs 提供；无全站独立编辑器 route。工具中心应提供说明和可执行深链，不能造独立编辑 API 或冒充通用编辑器。
8. Developer Center route 存在，但在 MDTBBS profile 导航能力关闭且头像菜单未提供入口；第三方应用/文档能力不应按开发者角色隐藏。
9. 当前存在本地帖子/回复/资源草稿恢复，但未发现个人草稿列表 route；未发现个人下载记录 route/API。My Space 不展示不存在的列表页，文档注明能力边界。
10. `/wiki` 出现在 site profile 导航但不在 Next route 清单中，是失效导航目标；IA 不再引用它，搜索结果的知识库分类仍按现有 API 能力处理。
11. 自定义 `sidebar_navigation_items` 与 `top_navigation_items` 可以重建旧长菜单。产品主导航改为固定六空间；后台历史配置表单和数据库设置需要明确不再控制主 IA，不能覆盖固定空间导航。

## 工作区状态

审计开始时分支为当前工作树的 `HEAD`，没有未提交改动。以上是代码审计结论；是否已部署、站点 feature flag 值、真实 presence 与存档数据，均需运行时环境验证。
