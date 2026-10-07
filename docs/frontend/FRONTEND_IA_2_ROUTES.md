# MDTBBS Frontend IA 2.0 — Route Map

This map reflects the Next.js pages in `frontend/src/app` and backend-served developer documentation linked from the frontend. Route groups `(public)` and `(auth)` do not appear in browser URLs. `Context` means an in-page link, card, owner action, or existing redirect; desktop/mobile entry identifies the shortest IA entry.

| Space | Page | Route | Desktop Entry | Mobile Entry | Permission |
| --- | --- | --- | --- | --- | --- |
| Home | Player dashboard | `/` | Home sidebar | Home tab | Public; personalized API responses require a session |
| Community | Community hub | `/community` | Community sidebar | Community tab | Public |
| Community | Recommended discovery | `/discover` | Community → Recommended | Community → Recommended | Public |
| Community | Recent discussions | `/threads` | Community → Latest | Community → Latest | Public |
| Community | Categories and category | `/categories`, `/categories/[id]` | Community → Categories | Community → Categories | Public |
| Community | Tags and tag | `/tags`, `/tags/[slug]` | Community → Tags | Community → Tags | Public |
| Community | Announcements and notice | `/notices`, `/notices/[id]` | Community → Announcements | Community → Announcements | Public |
| Community | Groups, leaderboard, shop | `/groups`, `/leaderboard`, `/shop` | Community hub, existing content links | Community hub, existing content links | Public; purchase/write actions use existing auth checks |
| Community | New post | `/posts/new` | Create → Discussion | Create sheet → Discussion | Sign-in required to publish |
| Community | Post detail/edit | `/posts/[id]`, `/posts/[id]/edit` | Discussion links; owner actions | Discussion links; owner actions | Detail public; editing requires owner/moderator permission |
| Community | Post revisions | `/posts/[id]/revisions`, `/posts/[id]/revisions/[revisionId]` | Post detail → History | Post detail → History | Existing post visibility and permission checks |
| Community | Public profile | `/users/[id]` | Author link; user menu → Profile | Author link; My → My posts | Public |
| Resources | Resource Center | `/resources` | Resources sidebar | Resources tab | Public |
| Resources | Resource detail | `/resources/[id]` | Resource list, search, post references | Resource list, search, post references | Public; private files/actions follow existing access checks |
| Resources | Edit resource metadata | `/resources/[id]/edit` | Resource detail → Manage | Resource detail → Manage | Owner/member/reviewer as currently enforced |
| Resources | Resource workbench | `/resources/[id]/workbench` | Resource detail → Open in editor | Resource detail → Open in editor | Existing ownership and workbench permissions |
| Resources | Version detail | `/resources/[id]/versions/[versionId]` | Resource detail → Versions | Resource detail → Versions | Public metadata; file access follows current contract |
| Resources | Resource submit | `/resources/submit` | Create → Other resource; Resources CTA | Create sheet; Resources CTA | Sign-in required |
| Resources | Map submit | `/resources/submit/map` | Create → Map | Create sheet → Map | Sign-in required |
| Resources | Schematic submit | `/resources/submit/schematic` | Create → Schematic | Create sheet → Schematic | Sign-in required |
| Resources | Legacy/general upload entry | `/resources/upload` | Existing contextual entry | Existing contextual entry | Existing upload authorization |
| Multiplayer | Multiplayer hub | `/multiplayer` | Multiplayer sidebar | Multiplayer tab | Public hub; action routes keep existing checks |
| Multiplayer | LanLink lobby and quick code | `/lanlink`, `/lanlink/quick-code` | Multiplayer → Lobby | Multiplayer → Lobby | Site feature gate; room actions use existing auth/session checks |
| Multiplayer | Server directory and management | `/servers` | Multiplayer → Servers | Multiplayer → Servers | Public directory; owned-server actions require authentication |
| Multiplayer | Apply for a server | `/apply-server`, `/servers/apply` | Servers → Apply | Servers → Apply | Sign-in/site-feature gate; legacy route redirects to `/servers?section=apply` |
| Multiplayer | Friends, Presence, invitations, and join requests | `/friends` | Multiplayer → Friends | Multiplayer → Friends | Sign-in required; invitations and join requests are managed in the page's pending section |
| Tools | Toolbox | `/tools` | Tools sidebar | Home shortcut, My, search, resource detail | Public |
| Tools | Schematic editor guide | `/tools/blueprint-editor` | Tools → Schematic editor | Home shortcut, search, resource detail | Public guide; editing keeps workbench permissions |
| Tools | Map editor guide | `/tools/map-editor` | Tools → Map editor | Home shortcut, search, resource detail | Public guide; editing keeps workbench permissions |
| Tools | Wave editor guide | `/tools/wave-editor` | Tools → Wave editor | Toolbox, search, map workbench | Public guide; wave tab requires a map workbench |
| Tools | Schematic analysis guide | `/tools/blueprint-analysis` | Tools → Analysis | Toolbox, search, schematic workbench | Public guide; underlying analysis follows resource visibility |
| Tools | User cloud saves | `/tools/cloud-saves` | Tools → Cloud saves | Toolbox, My, search | Sign-in required; service capability must be enabled |
| My | Personal dashboard | `/me` | Sidebar → My | My tab | Sign-in required |
| My | Notifications | `/notifications` | Notification action; My | Topbar notification; My | Sign-in required |
| My | Messages and conversation | `/messages`, `/messages/[userId]` | My dashboard | My dashboard | Sign-in required |
| My | Bookmarks | `/bookmarks` | My dashboard | My dashboard | Sign-in required |
| My | User's own resources | `/resources/my` | My → My resources | My → My resources | Sign-in required; existing owner/member checks |
| My | User settings and blocked users | `/settings`, `/settings/blocks` | User menu → Settings; My | My → Settings | Sign-in required |
| My | Edit profile | `/users/me/edit` | Profile context | My → Profile context | Sign-in required |
| Developer | Developer Center | `/developers` | User menu → Developer Center | User menu/feature search | Public docs; client-management actions retain current authorization |
| Developer | API reference | `/api/v1/reference` | Developer Center/OpenAPI feature search | Feature search | Public; served by the backend documentation router |
| Developer | API guides | `/api/v1/docs/[slug]` | Developer Center/API reference links | Feature search or API reference | Public; backend-served documentation pages |
| Developer | Online API debugger | `/api/v1/debugger` | API reference → Try endpoint | API reference → Try endpoint | Public page; calls are limited to documented public API operations |
| Developer | OpenAPI JSON | `/api/openapi/v1.json`, `/api/openapi/public-v1.json` | API reference | Feature search/API reference | Public machine-readable contract |
| Account | Login, registration, OAuth callback | `/login`, `/register`, `/callback` | Login redirects | Login redirects | Public auth flow |
| Account | Terms and phone verification | `/accept-terms`, `/verify-phone` | Required workflow redirect | Required workflow redirect | Session and site-feature gates as currently enforced |
| Site info | About, links, feedback, thanks | `/about`, `/links`, `/feedback`, `/thanks` | Footer | Footer | Public |
| Policy | Privacy, terms, community/resource rules, copyright | `/privacy`, `/terms`, `/community-guidelines`, `/resource-rules`, `/copyright` | Footer and relevant forms | Footer and relevant forms | Public |
| Admin | Admin home | `/admin` | Admin user-menu item | Admin user-menu item | Admin role only; Admin shell |
| Admin | User and community administration | `/admin/users`, `/admin/groups`, `/admin/levels`, `/admin/badges`, `/admin/points`, `/admin/shop` | Admin navigation | Admin navigation | Admin role only |
| Admin | Posts and moderation | `/admin/posts`, `/admin/categories`, `/admin/content`, `/admin/content/moderation`, `/admin/content/pages`, `/admin/content/pages/[key]`, `/admin/content/reports`, `/admin/content/tags` | Admin → Content | Admin → Content | Admin role only |
| Admin | Resource operations | `/admin/resources`, `/admin/resources/analytics`, `/admin/resources/categories`, `/admin/resources/import`, `/admin/resources/merge`, `/admin/resources/moderation` | Admin → Resources | Admin → Resources | Admin role only |
| Admin | Notifications and logs | `/admin/notifications`, `/admin/logs`, `/admin/security-access-logs` | Admin navigation | Admin navigation | Admin role only |
| Admin | Site settings | `/admin/settings`, `/admin/settings/announce`, `/admin/settings/basic`, `/admin/settings/brand`, `/admin/settings/cloud-saves`, `/admin/settings/display`, `/admin/settings/email`, `/admin/settings/external-api`, `/admin/settings/features`, `/admin/settings/footer`, `/admin/settings/moderation`, `/admin/settings/navigation`, `/admin/settings/notifications`, `/admin/settings/seo`, `/admin/settings/sidebar`, `/admin/settings/terms` | Admin → Settings | Admin → Settings | Admin role only; cloud-saves route configures the service, not a user's saves |
| Admin | System and plugins | `/admin/system`, `/admin/system/bans`, `/admin/system/cleanup`, `/admin/system/performance`, `/admin/system/rate-limits`, `/admin/system/rules`, `/admin/plugins` | Admin navigation | Admin navigation | Admin role only |
| Removed | User cloud-save route | `/settings/cloud-saves` | None | None | Removed; returns 404, with no redirect or compatibility page |

## Route entry changes

| Old | New | Notes |
| --- | --- | --- |
| `/settings/cloud-saves` | Removed | No alias or redirect; user cloud saves live at `/tools/cloud-saves`. |
| `/admin/settings/cloud-saves` | Unchanged | Separate administrator service configuration; it does not expose user save data. |
| No common space hub | `/community`, `/multiplayer`, `/tools`, `/me` | Added stable landing routes that connect existing pages and flows. |

## Orphan and link checks

- The `/wiki` link from the Club profile is not included in the new shell; there is no matching Next.js page.
- `/resources/my`, friends, tools, Developer Center, and cloud saves are now reachable from a stable space, search, or user-menu path.
- Resource detail and workbench routes remain under the Resource Center V2 hierarchy; no duplicate editor data path was introduced.
- The settings route no longer links to user cloud saves. The admin cloud-save settings page is still linked only from Admin.
- Route entries inherit the existing Next.js 404 behavior for removed/unknown pages. Route groups `(public)` and `(auth)` are implementation folders, not URL segments.
