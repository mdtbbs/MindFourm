# MDTBBS First-party API

This is the supported integration surface for Mindustry Mods and companion
clients. Do not depend on internal `/api/*` routes unless they are documented
in the OpenAPI document below.

## Base URL and discovery

All first-party routes are prefixed with `/api/v1`. Begin with:

```http
GET /api/v1/capabilities
```

The response declares whether resources, file grants, notifications and Forge
previews are available. Treat every `false` capability as unavailable; clients
must hide or disable the dependent feature rather than retrying an unsupported
endpoint.

When `OPENAPI_ENABLED=true`, the complete interactive contract is available at
`/api/docs/v1`, and the machine-readable OpenAPI document is
`/api/openapi/v1.json`. Disable these two routes publicly in production only if
you publish the generated JSON through your developer portal instead.

## Authentication and rate limits

Browser users use their forum session. Server-to-server integrations use a
scoped external API key managed from **Admin → External API**. Never place that
key in a Mod jar or browser bundle. The forum identifies user traffic using the
trusted CDN `X-Forwarded-For` address, while requests with the configured
`X-Forum-Internal-Key` bypass user rate limiting for server-side rendering and
trusted internal calls.

Production origins must accept traffic only from the CDN or private network;
otherwise a direct client can forge `X-Forwarded-For`.

## Stable V1 modules

| Module | Purpose |
| --- | --- |
| `v1/capabilities` | Feature discovery and client-version guidance |
| `v1/resources` | Resource discovery and resource detail contracts |
| `v1/threads` | Forum thread discovery contracts |
| `v1/discover` | Community discovery feeds |
| `v1/portal` | First-party portal data |

LanLink uses its own control-plane protocol. The forum exposes the scoped
quick-code validation endpoint for that service at
`POST /api/external/v1/lanlink/quick-code/validate`; it is not a public Mod
endpoint.

## Compatibility policy

- V1 adds optional response fields but does not rename or remove documented
  fields without a new version.
- Errors use HTTP status codes; clients must not parse human-readable error
  messages for control flow.
- Map and blueprint previews are asynchronous. A client may display the source
  attachment immediately and poll only the forum preview route after the
  capability confirms `forge_preview: true`.
