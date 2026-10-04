# 第三方客户端身份认证

第三方 Web、Android、桌面、Mod 和启动器客户端必须使用 MindAuth 公开客户端的授权码模式 + PKCE S256。每个应用需要独立的 `client_id`，并且只能申请已获批且产品实际需要的权限范围。

## 获取访问令牌

1. 在 [MindAuth 开发者中心](https://auth.mdtbbs.cn/developer) 创建公开客户端，并登记精确的重定向地址。
2. 为每次授权生成随机 `state` 和 PKCE `code_verifier`，用 SHA-256 计算 `code_challenge`。
3. 通过系统浏览器打开 MindAuth 授权页面；回调后先验证 `state`。
4. 使用授权码、原始 `code_verifier`、`client_id` 和同一个 `redirect_uri` 向 MindAuth 令牌接口兑换令牌。
5. 携带 `Authorization: Bearer <access_token>` 调用 MindFourm 的公开 V1 API。

完整授权参数、令牌刷新和撤销示例见[第三方客户端授权指南](/api/v1/docs/oauth)；PKCE 协议细节见 [MindAuth 公开客户端指南](https://github.com/mdtbbs/MindAuth/blob/main/docs/public-client-pkce.md)。

公开客户端不使用 `client_secret`。不要把用户密码、服务器凭证或其它应用的令牌收集到客户端，也不要在应用之间共享 `client_id`。

## 访问论坛 API

MindFourm 的访问令牌是不透明值。客户端只需原样作为 Bearer 发送，不要解析令牌，也不要把它放进 URL、日志或分析事件。论坛按操作声明的 OAuth 权限范围校验访问，并额外执行用户权限、站点功能和内容审核策略。

允许匿名读取的接口可以不带令牌；如果匿名请求携带 Bearer，论坛仍会校验该接口声明的可选权限范围。每个操作的认证要求、权限范围、限流和数据结构以 [公开 OpenAPI](/api/openapi/public-v1.json) 为准。

成功的 JSON 响应使用 `{ data, meta }`；失败响应使用 `{ error, meta }`。客户端按 HTTP 状态和稳定的 `error.code` 处理错误，并保留 `meta.request_id` 供排查。

## 兼容能力

论坛可能继续支持已发布第一方客户端所需的兼容登录方式。这些能力不属于第三方公开 API；新客户端不得依赖它们，也不会因此获得额外权限。

机器人或服务端集成如使用独立的外部 API 凭证，应只在可信服务端保存。它与公开客户端 OAuth 是不同的集成类型，不能嵌入浏览器、APK、Mod、启动器或桌面发行包。
