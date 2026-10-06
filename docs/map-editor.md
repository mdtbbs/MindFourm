# 地图安全编辑器

地图工作台使用官方 Mindustry renderer 的 MapIO 读取和导出地图。它只对已发布版本产生新的 direct-upload 版本，原始地图不变。

## 支持的编辑

- 在完整、未截断的地形网格中选择现有 floor 和 overlay 并修改格子。
- 编辑已识别的布尔世界规则。
- 新增、更新、删除和调整顺序的波次组；波次字段会经过类型和范围校验。
- 新增、删除、移动 Core、Spawn point 和 vanilla building/object，支持 Core 与 building 的 team 修改；多格占地逐格检查碰撞和地图边界。
- 导出、round-trip 校验，再进入资源版本审核流程。

## 安全边界

renderer 只接受官方 MapIO 格式，地图面积上限为 2,000,000 格；对象变更仅接受官方 vanilla core/spawn/building content 和合法 Team。Mod 地图、非法 content、未知或不能安全保留的 building 配置、越界坐标、footprint 碰撞和未知规则字段会失败关闭。矿脉、液体、标记与 floor/overlay 以外的绘制工具不在当前对象编辑范围。

地图图层和对象列表最多各解析 40,000 项；对象列表被截断时会禁用对象编辑。地形网格只有在完整解析且面积不超过 40,000 格时可绘制，单次导出最多提交 5,000 格地形变更。单次请求最多包含 2,000 个对象操作和 1,000 个波次操作。地图文件解压后超过 128 MiB 会在官方解析前拒绝。

能力开关依赖 renderer health protocol v2、Mindustry v160.5 固定运行时哈希、MapIO 与对象操作声明、RES 可用性和服务端 origin 配置。服务端仍会对每次操作重新授权、锁定版本并做官方 writer→parser round-trip 校验，不能通过修改前端请求绕过能力限制。

## 版本流程

地图保存会创建同一资源的新 revision，上传对象先保持私有并进入审核；只有审核发布后才会更新公开版本指针和绑定可见性。对象校验失败、RES 不可用或审核拒绝都不会删除或覆盖历史地图。
