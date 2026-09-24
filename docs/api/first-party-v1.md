# First-party API V1 参考

Base URL:

```text
/api/v1
```

推荐调用顺序：

1. `GET /api/v1/capabilities`
2. 根据客户端类型读取 `GET /api/v1/client/config`
3. 完成对应认证
4. 调用业务 API

完整 schema 以 `/api/openapi/v1.json` 为准。本页主要回答“有哪些稳定入口、给谁用、是否需要认证”。

## Capability 与客户端配置

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/capabilities` | Public | 第一方能力发现 |
| GET | `/api/v1/client/config` | Public | Android 等客户端版本和功能配置 |

## 移动端认证

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/mobile/exchange` | Public | MindAuth native code 换 Forum mobile token |
| POST | `/api/v1/auth/mobile/refresh` | Refresh token | 轮换 access/refresh token |
| POST | `/api/v1/auth/mobile/logout` | Forum Bearer / session | 注销指定设备会话 |
| GET | `/api/v1/auth/mobile/sessions` | Forum Bearer / session | 查看当前用户设备会话 |
| DELETE | `/api/v1/auth/mobile/sessions/{id}` | Forum Bearer / session | 撤销设备会话 |

认证细节见 [authentication.md](./authentication.md)。

## 用户

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | Required | 当前用户稳定资料 |
| PUT | `/api/v1/me/profile` | Required | 更新本人资料 |
| POST | `/api/v1/me/avatar` | Required | 上传本人头像 |
| GET | `/api/v1/users/{id}` | Public | 用户公开资料 |
| GET | `/api/v1/me/bookmarks` | Required | 当前用户书签 |

写请求还受手机号验证和封禁状态检查影响。

## Threads

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/threads` | Public | 讨论列表 |
| POST | `/api/v1/threads` | Required | 创建讨论 |
| GET | `/api/v1/threads/{id}` | Optional | 讨论详情；匿名可读，登录后附加 viewer / ownership 状态 |
| PUT | `/api/v1/threads/{id}` | Required | 修改讨论 |
| DELETE | `/api/v1/threads/{id}` | Required | 软删除讨论 |
| PUT | `/api/v1/threads/{id}/like` | Required | 点赞，幂等 |
| DELETE | `/api/v1/threads/{id}/like` | Required | 取消点赞，幂等 |
| PUT | `/api/v1/threads/{id}/bookmark` | Required | 收藏，幂等 |
| DELETE | `/api/v1/threads/{id}/bookmark` | Required | 取消收藏，幂等 |
| POST | `/api/v1/threads/{id}/replies` | Required | 回复讨论 |
| PUT | `/api/v1/threads/{threadId}/replies/{replyId}` | Required | 修改回复 |
| DELETE | `/api/v1/threads/{threadId}/replies/{replyId}` | Required | 软删除回复 |

列表支持 `limit`、`offset`、`category_id`，源码还支持 cursor 模式。客户端不要同时混用互斥分页策略。

## Resource V1

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/resources` | Public | 资源列表 |
| GET | `/api/v1/resources/{id}` | Public | 资源详情 |
| GET | `/api/v1/resources/{id}/manifest` | Public | 安装/同步 manifest |
| GET | `/api/v1/resources/{id}/preview` | Required | 资源预览 |
| GET | `/api/v1/resources/{resourceId}/versions/{versionId}/files/{fileId}/download` | Required | 版本文件下载 |

Resource V1 仍受 `resource_read` capability 和站点功能开关影响。具体身份、manifest 和文件安全规则见 [resources-v1-contract.md](./resources-v1-contract.md)。

## Game Content V1

Game Content 是蓝图和地图的一等客户端 API，入口为：

```text
/api/v1/game-content
```

它覆盖：

- 蓝图/地图浏览
- 搜索与 tags
- Feed
- 预览
- 蓝图代码复制
- 地图下载
- 点赞和收藏
- 蓝图直接提交
- 地图 multipart 上传、预览、完成提交
- 我的资源和收藏

完整 endpoint 表、请求参数、限流和上传流程见 [game-content-v1.md](./game-content-v1.md)。

## Discover / Home / Portal

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/discover` | Public | 发现页聚合 |
| GET | `/api/v1/home` | Public | 第一方首页数据 |
| GET | `/api/v1/portal` | Public | Portal 聚合数据 |
| GET | `/api/v1/lanlink/rooms` | Public | LanLink 公共房间列表 |

`/api/external/v1/lanlink/quick-code/*` 属于 External API，不属于这个公共 V1 面。

## Notices

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/notices` | Public | 已发布公告列表 |
| GET | `/api/v1/notices/{id}` | Public | 公告详情 |
| GET | `/api/v1/admin/notices` | Staff | 管理公告 |
| POST | `/api/v1/admin/notices` | Staff | 创建公告 |
| PATCH | `/api/v1/admin/notices/{id}` | Staff | 更新公告 |
| DELETE | `/api/v1/admin/notices/{id}` | Staff | 删除公告 |

## Feedback / Reports / Uploads

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/feedback` | Required | 提交反馈 |
| POST | `/api/v1/reports` | Required | 创建举报 |
| GET | `/api/v1/reports/mine` | Required | 查看自己的举报 |
| POST | `/api/v1/uploads/images` | Required | 上传正文图片 |

## 不属于 First-party V1 的接口

下列路径可能真实存在，但不要因为它们能调用就视为 V1：

```text
/api/resources/*
/api/posts/*
/api/replies/*
/api/service-api/*
/api/external/v1/*
/api/admin/*
```

这些路由有的是 legacy Web API，有的是机器人/后台/服务间接口。对外客户端需要新能力时，优先新增 `/api/v1/*` 契约，不要把内部路由直接暴露成“文档”。
