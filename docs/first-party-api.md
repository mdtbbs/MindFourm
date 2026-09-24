# MDTBBS First-party API

第一方 API 文档已经统一迁移到 [`docs/api/`](./api/README.md)。

请从以下入口开始：

- [API 文档总览](./api/README.md)
- [First-party V1 参考](./api/first-party-v1.md)
- [认证与凭证](./api/authentication.md)
- [Game Content V1](./api/game-content-v1.md)
- [Resource V1 契约](./api/resources-v1-contract.md)
- [External API](./api/external.md)

交互式 Swagger：

```text
/api/docs/v1
```

机器可读 OpenAPI：

```text
/api/openapi/v1.json
```

第一方客户端应先请求：

```http
GET /api/v1/capabilities
```

不要把未文档化的 `/api/*` legacy 路由当成稳定客户端契约。
