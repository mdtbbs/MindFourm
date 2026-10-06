# 蓝图安全编辑器

Resource Center V2 的蓝图工作台只处理已发布版本，并把编辑结果保存为新的 direct-upload 版本。原版本的文件、哈希、审核记录和下载地址不会被覆盖。

## 支持的操作

- 读取官方 Mindustry renderer 解析出的方块位置和静态逻辑配置。
- 选择、删除、移动和放置方块；按四分之一圈旋转，水平镜像；撤销最近编辑。
- 对受支持的处理器编辑静态逻辑文本和链接坐标。逻辑只作为文本保存和分析，服务端不会执行脚本。
- 导出官方 `.msch`，重新分析，并通过 metadata-first direct upload 创建新的 `ResourceVersion`。上传完成后版本进入现有审核流程。

## 安全边界

编辑入口只在能力接口同时确认 renderer 协议、固定 Mindustry v160.2 构建哈希、支持的操作集合和 RES 健康状态时显示。未知方块、无法保留的配置、超出解析上限或 renderer 不健康时会失败关闭，不生成可能丢失内容的文件。

当前轻编辑器接受宽高不超过 128、位置总数不超过 10000 的蓝图。它没有实现任意二进制配置编辑、垂直镜像、剪贴板批量变换、mod 方块安装或逻辑执行；这些内容会保留在源版本，不能通过此入口伪造为已支持的编辑。移动端使用同一键盘可访问网格和最小 44px 控件。

## 发布路径

1. 工作台调用 renderer 导出并做 round-trip 校验。
2. 调用 `POST /api/v1/resources/{id}/versions/direct-drafts` 创建同资源的新版本草稿。
3. 通过 `POST /api/v1/resources/uploads/init`、RES 短期 PUT、`POST /api/v1/resources/uploads/complete` 完成服务端对象校验和私有绑定。
4. 版本保持 `pending_review`，由原审核/发布流程决定是否公开。

任何一步失败都不会覆盖原版本；未完成的 direct-upload 草稿由既有过期清理流程处理。
