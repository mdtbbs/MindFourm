# 蓝图安全编辑器

Resource Center V2 的蓝图工作台只处理已发布版本，并把编辑结果保存为新的 direct-upload 版本。原版本的文件、哈希、审核记录和下载地址不会被覆盖。

## 支持的操作

- 读取官方 Mindustry renderer 解析出的方块位置、白名单 typed 配置和静态逻辑配置。
- 选择、删除、移动和放置方块；按四分之一圈旋转，水平镜像；撤销最近编辑。
- 按配置类型编辑 Item、Liquid、Unit type、Block/content 引用、Unit command、整数/长整数/浮点数、布尔值、文本、RGBA 颜色、Point2/Point2[] 链接、IntSeq/int[]/boolean[]、Vec2/Vec2[]、Team、LAccess、TechNode，以及逻辑处理器源码。逻辑只作为文本保存和分析，服务端不会执行脚本。
- 导出官方 `.msch`，重新分析，并通过 metadata-first direct upload 创建新的 `ResourceVersion`。上传完成后版本进入现有审核流程。

## 安全边界

编辑入口只在能力接口同时确认 renderer 协议、固定 Mindustry v160.5 构建哈希、配置读写操作集合和 RES 健康状态时显示。v160.5 官方 `TypeIO` 可序列化的任意对象不等于可编辑配置：Renderer 只接受显式 typed DTO，且值的 Java 类型必须在该方块的 `Block.configurations` 注册。非法 content、越界链接、未知配置类、live Building/Unit 引用、Bullet/Seq 和当前未实现的 opaque byte/Object arrays 均失败关闭；不会将任意 JSON 交给官方 writer。

当前轻编辑器接受宽高不超过 128、位置总数不超过 10000、解压后不超过 16 MiB 的蓝图；每次最多提交 5000 个 typed config 修改。点链接按方块 anchor 加相对偏移检查目标是否仍位于蓝图边界；移动链接方块时通过官方 `pointConfig` 更新自身连接。未被当前矩阵覆盖的序列化类型不能经过此编辑器导出。编辑只改变新生成版本，不执行逻辑或加载 Mod。移动端使用同一键盘可访问网格和最小 44px 控件。

## 发布路径

1. 工作台调用 renderer 导出并做 round-trip 校验。
2. 调用 `POST /api/v1/resources/{id}/versions/direct-drafts` 创建同资源的新版本草稿。
3. 通过 `POST /api/v1/resources/uploads/init`、RES 短期 PUT、`POST /api/v1/resources/uploads/complete` 完成服务端对象校验和私有绑定。
4. 版本保持 `pending_review`，由原审核/发布流程决定是否公开。

任何一步失败都不会覆盖原版本；未完成的 direct-upload 草稿由既有过期清理流程处理。
