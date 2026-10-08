# MDTBBS Frontend IA 2.0

## Purpose and scope

MDTBBS exposes community, game resources, editors, multiplayer, cloud saves, and developer services. This IA gives those capabilities stable user-facing spaces while keeping Resource Center V2, its APIs, file pipeline, renderer, permissions, versioning, and review flows as the source of truth.

The shell changes navigation and discovery. Existing content routes remain canonical unless listed as a route move below. `/settings/cloud-saves` is removed; the user cloud-save workspace is `/tools/cloud-saves`. The separate administrator configuration remains at `/admin/settings/cloud-saves`.

## Primary spaces

| Space | Canonical entry | Contains |
| --- | --- | --- |
| Home | `/` | Community and resource discovery, product shortcuts, servers and create entry points |
| Community | `/community` | Recommended content, latest discussions, categories, tags, announcements, and post creation |
| Resources | `/resources` | Mod, map, schematic, and other Resource Center V2 content |
| Multiplayer | `/multiplayer` | LanLink, public and owned servers, friends, presence, invitations, and join flows |
| Tools | `/tools` | Schematic, map, wave, and analysis workbench guides plus cloud saves |
| My | `/me` | Notifications, messages, friends, bookmarks, posts, resource management, drafts, and settings |

Primary navigation follows tasks rather than backend entities. Each space owns its own page-level navigation. The desktop sidebar has six stable links; My is visually separated at the bottom. Community and Resources pages also show a contextual list of discussion boards or resource kinds, collapsed by default and opened from its heading. Mobile uses five bottom tabs (Home, Community, Resources, Multiplayer, My), keeping the established five-item touch pattern. Tools remain reachable from the home shortcuts, My, feature search, resource details, and the desktop sidebar.

## Desktop shell

`ContentShell` composes the fixed `ContentSidebar`, `ContentToolbar`, page body, footer, mobile bottom navigation, and the search dialog. The sidebar uses one icon family and marks the active workspace with both an accent bar and text styling. Its Community and Resources context lists start collapsed and expand when the user activates the section heading.

The top bar keeps global actions visible: workspace breadcrumb, global search, `+ Create`, notifications with the existing unread state, and the authenticated user menu. Developer Center is available to regular signed-in users from that menu. Admin appears only for `user.role === 'admin'`. The existing admin shell and admin route groups remain separate.

The breadcrumb is deliberately short: it names the primary space and current page. Content detail pages may add their own local context; the global sidebar remains stable.

## Mobile navigation and creation

Mobile keeps Home, Community, Resources, Multiplayer, and My in the bottom bar. Search, notifications, and Create stay in the top bar. Create opens an accessible sheet with discussion and resource submission choices. Anonymous users see the sign-in action; private routes are also protected by middleware and continue through the normal login route.

The sheet and search dialog lock background scroll, support Escape, contain keyboard focus, and return focus to their trigger after dismissal. Touch targets are at least 44 CSS pixels where practical, and the shell includes a skip-to-content link and safe-area padding.

## Search and Feature Registry

The top-bar search button, mobile search button, `Ctrl+K`, `Cmd+K`, and `/` outside editable fields open one command palette. It searches a small local `FEATURE_REGISTRY` for destinations, then debounces matching content against the existing Public V1 `/search` endpoint. Results are grouped by feature/space, resource, post, user, and server. Arrow keys, Home/End, Enter, Escape, and retry are supported. Full search remains available as a result action and at `/search`.

The registry is an index of existing destinations, not a replacement for API permissions. It includes tools, resource kinds, friends, My Resources, bookmarks, notifications, settings, Developer Center, and OpenAPI. Private destinations continue through middleware. Do not load a large content index into the shell.

## Resource discovery

The Resource Center keeps resource kind and its existing shareable query parameters. Search, supported game version, and sort remain visible in the primary filter row. Topic/category, platform, planet, and tag live in the advanced filter panel; mobile opens the same controls in a bottom sheet. Active query filters can be removed one at a time or cleared together. The UI only exposes filters supported by the current resource list contract.

Resource details open `/tools/blueprint-editor` or `/tools/map-editor` with the resource UUID and selected version. These tools reuse the existing editors and official renderer. Public resource copies can be edited/exported by visitors; original resource management keeps ownership checks.

## Route conventions

- Primary spaces use stable roots: `/community`, `/resources`, `/multiplayer`, `/tools`, and `/me`; `/` remains Home.
- Resource details, immutable versions, and workbenches stay under `/resources/[id]` to preserve Resource Center V2 contracts.
- Tool landing pages use `/tools/*`. Editor tools support local files and public versions. Temporary file processing does not create a parallel resource model; publication uses the existing RES direct-upload and review pipeline.
- User cloud saves use `/tools/cloud-saves`; `/admin/settings/cloud-saves` remains an unrelated administrative configuration page.
- `/developers`, `/api/v1/reference`, `/api/v1/docs/*`, and `/api/v1/debugger` remain discoverable from the user menu, Developer Center, or feature search, without occupying a primary space.
- Authentication, redirects, legacy content URLs, and admin URLs remain in their existing route families. See the [route map](FRONTEND_IA_2_ROUTES.md) for entry and permission details.

## Permissions and unavailable capabilities

Middleware protects `/me`, `/friends`, `/resources/my`, `/tools/cloud-saves`, notifications, messages, bookmarks, settings, and existing protected actions. A guest may discover a destination, but must sign in before accessing private data. Create actions that require authentication are not presented as executable to guests.

Admin stays role-gated. Developer Center is not gated by a developer role because regular users can discover and request client access. Site feature switches continue to govern LanLink and server routes. Where there is no user-facing API or page, the IA says so and does not manufacture data: following-feed and download-history lists remain unavailable. Draft recovery stays in the existing editors.

Tool cards lead to working schematic/map editors. The wave tool supports new/imported configurations and maps, reusing the map wave editor. Export checks pinned renderer capabilities; publishing and managing original resources retain their respective authorization.

## Design and extension rules

- Keep the existing MDTBBS color tokens, typography, theme support, and page components.
- Keep primary navigation shallow: space → local section → content.
- Keep resource categories and filters on the product page. Use the contextual sidebar for discussion-board and resource-kind shortcuts, collapsed by default. Preserve shareable resource query state and expose advanced filters progressively.
- Use the existing resource aggregate, file and download pipeline, renderer, and ownership checks. Do not create a parallel resource model or editor workflow.
- Add new user capabilities to the appropriate space and Feature Registry; add a desktop/mobile entry only where its task frequency supports it.
- Keep administrator tools inside the admin shell. Add public API docs and client services to the Developer Center, not the primary user sidebar.
- Provide translated labels for all four supported locales (`zh-CN`, `en`, `ru`, `ja`). Keep loading, empty, and error states honest and recoverable.

## Current limits

The community Following section is disabled because no dedicated following-feed API exists. My Space does not show a download list because no user-facing download history route/query API exists. Recent tools are stored locally in the browser. Cloud saves display real server data only when the site capability is enabled.

The Multiplayer hub reads public active servers from the existing discovery API and, for signed-in users, friend presence from the existing social-presence API. Invitation and join-request management stays in the pending section of `/friends`; the hub links there rather than duplicating that workflow.
