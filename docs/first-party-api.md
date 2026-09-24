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
scoped external API key managed from **Admin → External API**. The Game Content
API accepts a MindAuth access token as `Authorization: Bearer …`; MindFourm
validates it through MindAuth userinfo and maps the returned identity to the
local forum user. MindFourm never accepts account passwords. Never place a
server API key in a Mod jar or browser bundle. The forum identifies user traffic
using the trusted CDN `X-Forwarded-For` address, while requests with the
configured `X-Forum-Internal-Key` bypass user rate limiting for server-side
rendering and trusted internal calls.

Production origins must accept traffic only from the CDN or private network;
otherwise a direct client can forge `X-Forwarded-For`.

## Stable V1 modules

| Module | Purpose |
| --- | --- |
| `v1/capabilities` | Feature discovery and client-version guidance |
| `v1/resources` | Resource discovery and resource detail contracts |
| `v1/game-content` | Public blueprint/map discovery, MindAuth interactions, uploads, and downloads |
| `v1/threads` | Forum thread discovery contracts |
| `v1/discover` | Community discovery feeds |
| `v1/portal` | First-party portal data |

LanLink uses its own control-plane protocol. The forum exposes the scoped
quick-code validation endpoint for that service at
`POST /api/external/v1/lanlink/quick-code/validate`; it is not a public Mod
endpoint.

The Game Content API exposes blueprints and maps from the existing Resource
domain. Its generated OpenAPI document defines the complete routes, query
parameters, and MindAuth Bearer security for authenticated operations.

`GET /api/v1/game-content/feed?type=featured` returns moderator/admin-curated
resources. The existing **Admin → Resources** table shows views, downloads,
and the featured toggle. Public Feed reads still apply the regular Resource
visibility policy. `trending` uses a seven-day score from persisted grants,
likes, and favorites; it does not reuse lifetime downloads as a popularity
proxy. Detail views are incremented atomically and deduplicated for 60 seconds
per signed-in user or HMAC-derived anonymous client key.

Map uploads persist their UUID session, owner, hash, managed file path, renderer
metadata, preview key, expiry, and completion Resource reference. Clients can
resume with `GET /api/v1/game-content/maps/uploads/:uploadId`, fetch their
private preview, and retry completion without creating a second Resource.
Expired sessions and abandoned incoming files are cleaned automatically.
Successful download grants and lifecycle events are written to
`download_events`; `resources.download_count` remains the fast aggregate and
its existing values are preserved by migration.

## Compatibility policy

- V1 adds optional response fields but does not rename or remove documented
  fields without a new version.
- Errors use HTTP status codes; clients must not parse human-readable error
  messages for control flow.
- Map and blueprint previews are asynchronous. A client may display the source
  attachment immediately and poll only the forum preview route after the
  capability confirms `forge_preview: true`.
