# 玩家资源编辑器交付记录（2.7.11）

本次在 `feat/player-resource-editors` 分支复用现有编辑器，补齐公开副本、本地文件、版本元数据和玩家交互。公开资源的已发布版本允许游客编辑并下载；登录用户可通过 RES 上传自己的新资源并进入审核。原资源的版本发布、所有权、维护者和审核权限继续由原接口校验。

## 蓝图编辑器

- 资源详情直接进入 `/tools/blueprint-editor?resource=…&version=…`，可以选择已发布版本或上传本地 `.msch`。
- 单选、多选、矩形选择、选择同类、批量移动、删除、复制粘贴、放置方块、调整选中方块朝向，以及整体旋转/镜像。
- 共用撤销/重做；Ctrl/⌘+Z、Shift+Ctrl/⌘+Z、Ctrl/⌘+Y、复制/粘贴和删除快捷键。
- 官方中文分类、星球筛选、名称搜索和图标选择；默认简单模式，配置和逻辑在高级模式展开。
- 类型化配置、原始文本、物品配置和安全坐标链接随副本保留；处理器支持行号、缩进、查找和语法预览。代码只作为文本保存，不在网页或服务器执行。
- 修复贴边方块在四个方向旋转、镜像时的边界及偶数尺寸链接坐标，导出仍由官方 writer→reader 校验。

## 地图编辑器

- 本地 `.msav`、公开资源版本和工作台复用同一编辑器；画布支持缩放、平移、触控和图层显示。
- 地形/覆盖层画笔、擦除覆盖层、矩形、填充、区域选择及复制粘贴；一次笔画对应一次历史操作。
- 大地图使用 128×128 分区和位图图层；从官方 MapIO 获取完整分区后才能修改，避免把截断元数据当作整张地图。
- 核心、出生点、建筑的选中、拖动、新增、删除、移动；核心/建筑支持队伍和朝向。前端与官方 writer 均校验多格占地、边界和碰撞。
- 地形、规则、对象、波次共用撤销/重做。规则分组显示中文字段，导出保留未改动字段和原对象配置。

## 波次编辑器

- 官方中文单位、状态效果、物品选择器；结构化单位载荷和携带物品数量。
- 新增、删除、复制、排序、区间/数量/增长/护盾/出生点编辑，批量编辑、模板和时间轴拖动。
- 可缩放预览范围、查看每波数量和 Boss 组；数量计算遵循 v160.5 `SpawnGroup.getSpawned` 的默认值、间隔和增长公式。
- 新建、导入、下载 `mindustry-waves-v1` JSON；导入地图后导出真实 `.msav`。界面波次从 1 开始，文件索引保持官方从 0 开始。

## 工具页、资源详情和版本数据

`/tools/blueprint-editor`、`/tools/map-editor`、`/tools/wave-editor` 均能直接处理本地文件，不要求先发布。本地文件在浏览器保留，服务端处理结束清理临时输入，未发布前不建立永久资源绑定。上传地图期间隐藏空白波次配置编辑区，避免把修改操作应用到正在被替换的配置。

资源详情编辑链接直达编辑器，UUID 详情链接也能正常解析。工作台按所选版本读取尺寸、方块数和解析信息，不拿根资源的另一版本元数据填充当前版本。历史版本缺少索引时，从校验后的源文件读取并短期缓存元数据，不执行数据库回填。无法读取的字段明确保持不可用。

公开副本发布走现有 metadata-first draft → RES 短期 PUT → authoritative complete → pending review 流程；下载和发布均不覆盖原资源。发布按钮保留登录及站点写入验证要求；游客可编辑并下载。

## Frontend IA 2 验收

六个一级空间、桌面侧栏、移动底栏、全局搜索和创建入口保持现有设计。编辑器在工具空间直接可达，开发者中心和管理入口保持原角色边界。`/settings/cloud-saves` 继续返回 404，个人云存档仍在 `/tools/cloud-saves`，没有恢复兼容路由。

导航回归修正了搜索选项匹配歧义，并验证实际登录跳转链；创建菜单测试等待认证状态完成，避免点击到认证初始化前的临时组件。

## 新增及增强测试

- 匿名公开副本可导出，私有、待审核、显式 private、隐藏分类和删除状态不能绕过读取授权。
- 旧版本读取缺少 readiness verifier 时失败关闭；能力检查继续要求协议、固定运行时摘要、操作集合和 RES 健康状态。
- CSRF 仅在明确 token 失效时用当前 cookie 重试一次；可见性拒绝不重试。
- 嵌套配置和逻辑链接元数据不会被浅层清洗丢失，截断图层显式标记。
- 官方真实 `.msch` 配置复制和所有旋转/镜像；官方 `.msav` 对象移动、队伍和旋转共同往返验证。
- 浏览器验证本地蓝图撤销/重做及官方重读、地图波次导入及官方重读、公开详情直达编辑器、游客下载、普通用户发布自己的待审核副本，以及 375px 窄屏可用性。
- 原版本审核与并发版本写入测试继续通过。CI 增加固定官方解析器启动和编辑器浏览器用例；隔离 E2E 数据库补建已有 migration 管理的访问统计表。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 后端构建 | 通过 |
| 后端 Jest 全量 | 246 个套件、1,571 个测试通过 |
| 编辑器相关前端 Jest | 5 个套件、38 个测试通过 |
| frontend lint / typecheck | 通过 |
| Next.js 生产构建 | 通过 |
| 编辑器与原版本审核 Playwright（生产构建） | 5/5 通过 |
| Frontend IA + API 文档/管理壳 Playwright（生产构建） | 14/14 通过 |
| OpenAPI export / check | 通过，Public API 1.3.0 |
| API changelog guard 单测 | 7/7 通过 |
| Renderer 编译、视觉与安全回归 | 通过，固定官方 v160.5 JAR 摘要验证通过 |
| git diff --check | 通过 |

验证使用独立 `mindfourm_ci` 数据库、Redis、测试 RES 服务和官方 Java worker。未执行生产迁移、生产回填或线上部署。

## 真实技术限制

- 蓝图宽高最多 128，位置数量最多 10,000，解压后最多 16 MiB；未知 Mod 内容、未纳入安全矩阵的配置和非法引用会拒绝导出。
- 地图面积最多 2,000,000 格、解压后最多 128 MiB；单次导出地形修改最多 5,000 格、对象操作最多 2,000、波次操作最多 1,000。超过操作预算时需要先导出并重新打开文件继续编辑。
- 元数据和对象列表有界；对象列表截断时禁用对象编辑，大地图地形从官方读取完整分区。没有完整数据时不会开放盲写。
- v160.5 的 SpawnGroup 载荷字段是 UnitType，不能虚构方块载荷；独立波次 JSON 缺少地图地形和对象，不能直接变成 `.msav`。
- 配置值经过官方已注册类型白名单校验；不能安全保存的对象状态会失败关闭。高级规则中未知字段保留，但不能作为任意 JSON 修改提交。
- 本地文件不会自动同步到跨设备草稿；用户可下载文件或明确发布自己的资源。发布仍需满足登录、站点验证、RES 可用和审核要求。
- 上线必须同时更新并启用本次 Java worker。旧 worker 缺少 catalog/copy/region/rotate 操作时，编辑服务返回 503；本次未把本地成功当作线上已部署。

## 修改文件列表

- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`
- `docs/api/changelog-v1.md`
- `docs/frontend/FRONTEND_IA_2.md`
- `docs/frontend/FRONTEND_IA_2_ROUTES.md`
- `docs/map-editor.md`
- `docs/player-editors-delivery.md`
- `docs/product/changelog.md`
- `docs/schematic-editor.md`
- `frontend/src/app/(public)/resources/[id]/page.tsx`
- `frontend/src/app/(public)/tools/blueprint-editor/page.tsx`
- `frontend/src/app/(public)/tools/map-editor/page.tsx`
- `frontend/src/app/(public)/tools/wave-editor/page.tsx`
- `frontend/src/components/forum/resource-detail.tsx`
- `frontend/src/components/forum/resources/workbench/content-picker.tsx`
- `frontend/src/components/forum/resources/workbench/editor-canvas.tsx`
- `frontend/src/components/forum/resources/workbench/editor-history.ts`
- `frontend/src/components/forum/resources/workbench/editor-source.ts`
- `frontend/src/components/forum/resources/workbench/logic-code-editor.tsx`
- `frontend/src/components/forum/resources/workbench/map-light-editor.spec.ts`
- `frontend/src/components/forum/resources/workbench/map-light-editor.tsx`
- `frontend/src/components/forum/resources/workbench/map-rule-labels.ts`
- `frontend/src/components/forum/resources/workbench/map-tile-image.tsx`
- `frontend/src/components/forum/resources/workbench/player-labels.ts`
- `frontend/src/components/forum/resources/workbench/publish-editor-copy.ts`
- `frontend/src/components/forum/resources/workbench/resource-kind-data-workspace.tsx`
- `frontend/src/components/forum/resources/workbench/resource-workbench-v2.tsx`
- `frontend/src/components/forum/resources/workbench/schematic-light-editor.spec.ts`
- `frontend/src/components/forum/resources/workbench/schematic-light-editor.tsx`
- `frontend/src/components/forum/resources/workbench/wave-editor.tsx`
- `frontend/src/components/forum/resources/workbench/wave-model.ts`
- `frontend/src/components/forum/resources/workbench/wave-timeline.tsx`
- `frontend/src/components/tools/editor-tool-workspace.tsx`
- `frontend/src/i18n/locales/zh-CN/common.json`
- `frontend/src/lib/api/editor-tools.spec.ts`
- `frontend/src/lib/api/editor-tools.ts`
- `frontend/src/lib/api/v1/resources.ts`
- `openapi-internal-v1.json`
- `openapi-public-v1.json`
- `openapi-v1.json`
- `package-lock.json`
- `package.json`
- `scripts/check-openapi.cjs`
- `scripts/e2e-resource-storage.cjs`
- `scripts/prepare-e2e-database.cjs`
- `src/main.ts`
- `src/modules/capabilities/capabilities.service.spec.ts`
- `src/modules/capabilities/capabilities.service.ts`
- `src/modules/resources/resource-preview.service.spec.ts`
- `src/modules/resources/resource-preview.service.ts`
- `src/modules/resources/resources.controller.ts`
- `src/modules/resources/resources.service.spec.ts`
- `src/modules/resources/resources.service.ts`
- `src/modules/resources/v2/resources-v2-write.controller.ts`
- `src/modules/resources/v2/resources-v2-write.dto.ts`
- `src/modules/resources/v2/resources-v2-write.service.spec.ts`
- `src/modules/resources/v2/resources-v2-write.service.ts`
- `src/modules/resources/v2/resources-v2.controller.ts`
- `src/modules/resources/v2/resources-v2.service.ts`
- `src/modules/resources/wave-editor-render.spec.ts`
- `src/openapi/api-version.ts`
- `src/openapi/public-v1-operation-allowlist.ts`
- `tests/e2e/navigation.spec.ts`
- `tests/e2e/player-resource-editors.spec.ts`
- `tests/fixtures/editor-map.README.md`
- `tests/fixtures/editor-map.msav`
- `tools/mindustry-renderer/src/main/java/cn/mdtbbs/renderer/MapRenderer.java`
- `tools/mindustry-renderer/src/test/java/cn/mdtbbs/renderer/EditorSafetyRegression.java`
- `tools/mindustry-renderer/src/test/java/cn/mdtbbs/renderer/RendererVisualRegression.java`
