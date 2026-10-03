# 第三方客户端身份认证

第三方 Web、Android、桌面、Mod 和启动器客户端必须使用 MindAuth Public Client 的 Authorization Code + PKCE S256。每个应用需要独立的 `client_id`，并且只能申请已获批且产品实际需要的 scopes。

## 获取访问令牌

1. 在 [MindAuth 开发者中心](https://auth.mdtbbs.cn/developer) 创建 Public Client，并登记精确的 Redirect URI。
2. 为每次授权生成随机 `state` 和 PKCE `code_verifier`，用 SHA-256 计算 `code_challenge`。
3. 通过系统浏览器打开 MindAuth 授权页面；回调后先验证 `state`。
4. 使用授权码、原始 `code_verifier`、`client_id` 和同一个 `redirect_uri` 向 MindAuth token endpoint 兑换令牌。
5. 携带 `Authorization: Bearer <access_token>` 调用 MindFourm 的 Public V1 API。

完整授权参数、令牌刷新和撤销示例见[第三方客户端授权指南](/api/v1/docs/oauth)；PKCE 协议细节见 [MindAuth Public Client 指南](https://github.com/mdtbbs/MindAuth/blob/main/docs/public-client-pkce.md)。

Public Client 不使用 `client_secret`。不要把用户密码、服务器凭证或其它应用的令牌收集到客户端，也不要在应用之间共享 `client_id`。

## 访问论坛 API

MindFourm 的 access token 是不透明值。客户端只需原样作为 Bearer 发送，不要解析 token，也不要把它放进 URL、日志或分析事件。论坛按操作声明的 OAuth scope 校验访问，并额外执行用户权限、站点功能和内容审核策略。

允许匿名读取的接口可以不带 token；如果匿名请求携带 Bearer，论坛仍会校验该接口声明的可选 scope。每个操作的认证要求、scope、限流和 schema 以 [Public OpenAPI](/api/openapi/public-v1.json) 为准。

成功的 JSON 响应使用 `{ data, meta }`；失败响应使用 `{ error, meta }`。客户端按 HTTP 状态和稳定的 `error.code` 处理错误，并保留 `meta.request_id` 供排查。

## 兼容能力

论坛可能继续支持已发布第一方客户端所需的兼容登录方式。这些能力不属于第三方 Public API；新客户端不得依赖它们，也不会因此获得额外权限。

机器人或服务端集成如使用独立的 External API 凭证，应只在可信服务端保存。它与 Public Client OAuth 是不同的集成类型，不能嵌入浏览器、APK、Mod、启动器或桌面发行包。
