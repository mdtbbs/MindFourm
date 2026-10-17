# 富文本正文 Presentation Contract

Schema v2 的 `content_json` 仍是新内容的规范数据源。`content` 是兼容投影，`content_html` / `content_text` 是派生数据；本次不修改 API schema、后端清洗或数据库结构。

## 共享边界

- `frontend/src/styles/rich-content.css` 是编辑、阅读、Markdown fallback 的普通正文样式来源。`.mdtbbs-rich-content` 定义 16px / 1.75、间距、列表、代码、图片、表格、任务列表、剧透、Mention、Emoji 和卡片布局。不要为新的正文页面另加 prose 或字号/行高覆盖。
- `RichContentShell` 和 `.rich-post-title` 共享正文宽度与帖子标题。编辑器根节点同样使用该宽度，编辑 chrome 的内边距与帖子正文一致。
- `presentation.ts` 为编辑器和 reader 提供相同的有界文字样式；`syntax-highlight.ts` 提供相同的 lowlight 实例。新增 mark 必须同步现有 Schema allowlist，而非直接开放任意 CSS。
- `RichVideoCard`、`RichAttachmentCard`、`RichQuoteCard` 由 Tiptap React NodeView 和正式 `RichContentRenderer` 共用。NodeView 不改变 `renderHTML` 序列化契约。Task item / spoiler / table 使用相同的结构属性与横向滚动包装；列宽、单元格对齐和有序列表 marker 同样在两种 DOM 中保留。
- `PostComposerPresentation` 在新建和编辑页以单栏 tabs 切换；预览直接读取当前 JSON 并使用正式 renderer。编辑面板只是隐藏，没有卸载，没有将预览结果序列化回写。
- 编辑器 schema 不得比后端 `childAllowed()` 更宽。`schema-content.ts` 持有前端侧的父子契约，`editor-extensions.ts` / `rich-content-extensions.ts` 用它收紧 `listItem` / `taskItem` / `blockquote` / 表格单元格 / `spoiler` 的 `content`。范围一旦放宽，工具栏就能造出后端 `INVALID_CONTENT_JSON` 拒收的文档（列表项或表格单元格里的剧透、引用块里的视频/附件/引用帖），用户只会在发布失败时才发现。`tiptap-content.contract.spec.ts` 会把编辑器 schema 的每一对父子组合与后端校验对撞。
- 表格列宽由 `richTableLayout`（`table-presentation.ts`）唯一计算，编辑器 `PresentedTableView`（`table-view.ts`）与 reader `RichContentRenderer` 共用。不要再用 Tiptap 自带的 `TableView`：它会写入 `min-width: 50px` / `25px`，与样式表的 `min-width: 30rem` 打架，同一张表在编辑态和发布态宽度不同。

编辑态仍允许光标、选区、placeholder、节点选中、表格选区、移动键盘工具栏；阅读态任务复选框不可写。视频只在读者操作后加载 allowlisted iframe，编辑态不加载播放器。引用只持有 ID，阅读时仍重新检查可见性；附件下载仍依赖权限接口。附件草稿的文件名/MIME/大小仅保存在本地 display metadata，不写入 JSON schema；草稿恢复时没有 metadata 仍可显示通用占位，不影响发布绑定。

## 检查

```bash
# 使用仓库 Node 20 和 npm 锁文件
npm run build:backend
npm test -- --runInBand
npm run openapi:check
npm run test:api-changelog
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build

# 独立 presentation 检查：API fixture 只用于页面呈现，不是真实发布验收
npx playwright test --config playwright.presentation.config.ts
# 可选：使用系统 Chromium
PRESENTATION_CHROMIUM_PATH=/usr/bin/chromium npx playwright test --config playwright.presentation.config.ts

# 真实认证、写入、清洗、草稿绑定、发布和读取链路
# 仅针对隔离的 MySQL/Redis，后端须 ENABLE_TEST_AUTH=true；启动前先检查迁移。
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4502 npx playwright test tests/e2e/rich-content.spec.ts --project=chromium

git diff --check
```

独立 suite 使用真实 `/posts/new`、`/posts/{id}` 页面和生产组件，比对编辑 / 预览 / fixture 发布页的 computed styles、内容宽度、JSON / Markdown 无损切换和实际提交 payload，并检查 1280px 桌面及 390×844、360×800、412×915 页面溢出和键盘工具栏。每个尺寸保存 editor / preview / published PNG 与 style JSON；目前为 screenshot artifact，尚未建立 golden snapshot。

两套 Playwright suite 不应并发启动在相同端口，或与 frontend build 共享 `.next`。fixture suite 不连接数据库且没有数据库 teardown，不能证明真实后端行为、安全授权或数据持久化。

## 当前环境限制

当前 master 的空库 `BaselineSchema` 从实体生成 `friendships.pair_low` 后，`MultiplayerPlatformV11720000150000` 再次无条件添加该列，导致 `Duplicate column name 'pair_low'`。这属于已有迁移缺陷，本次 presentation 任务没有修改它；真实 API rich-content E2E 需在迁移修复后重跑。不要把 fixture API 的页面验证报告为真实发布通过。

本次不需要新数据库迁移或数据回填。生产部署需重建并部署前端；既有安全和 Schema v2 后端契约保持不变。

## 本次验证证据

- 后端构建、246 个 Jest suite / 1564 项测试通过；最新编辑器 / Schema v2 契约与 presentation allowlist 共 4 项定向测试通过。
- 前端 lint、typecheck、生产 build 和 Public V1 OpenAPI / 7 项 API changelog guard 检查通过。
- 独立浏览器 presentation suite：7 项通过，包括四种尺寸的 computed styles / 三态截图、Markdown fallback、光标位置 / 撤销历史、新建和帖子编辑预览。
- 真实 API publication case 已尝试，认证阶段连接 4000 端口失败；独立运行 migration:run 再次确认 `ER_DUP_FIELDNAME: Duplicate column name 'pair_low'`。真实后端发布、安全授权、附件实际绑定和完整既有 rich-content E2E 仍未通过验收。
- 截图位于 `test-results/presentation/`（忽略生成目录），不是 golden snapshots。
