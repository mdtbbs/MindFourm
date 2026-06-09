# CLAUDE.md Regeneration Plan

> **Goal:** Completely rewrite MindFourm/CLAUDE.md to cover all 17 design documents comprehensively.
>
> **Approach:** Single-file write with 16 structured sections, ~400-500 lines.
>
> **Source:** 17 design docs in `docs/design/` + existing CLAUDE.md + codebase exploration.

---

### Sections to Cover

| # | Section | Source Docs |
|---|---------|-------------|
| 1 | Project Overview | 05-feature-specs, CLAUDE.md existing |
| 2 | Commands | Existing CLAUDE.md |
| 3 | Architecture Diagram | 06-backend, 03-frontend |
| 4 | Backend Structure (modules, guards, interceptors, utils, database, entities) | 01-database, 02-api, 06-backend |
| 5 | Frontend Architecture (routing, state, SSE, components, data fetching) | 03-frontend |
| 6 | Key Patterns (response format, auth, rate-limit, pagination, validation, cache, soft-delete) | 02-api, 11-security, 16-performance |
| 7 | Security Design (session, roles, XSS, CORS, rate-limit, ban/CIDR, CSP) | 11-security, 14-auth |
| 8 | Integration (MindAuth OAuth flow, EasyManager API, callbacks) | 14-auth, existing |
| 9 | Feature Specs (posts, replies, notifications, admin, search, email) | 05-feature, 12-search, 13-email |
| 10 | Plugin System (planned: hooks, EventBus, template injection points) | 08-plugin, 09-plugin, 10-template |
| 11 | Deployment (Docker dev/prod, Nginx, SSL, health checks) | 04-deployment |
| 12 | Performance Optimization (Redis cache strategy, DB indexing, connection pool, cursor pagination) | 16-performance |
| 13 | Logging & Monitoring (Winston, operation logs, health checks, SLAs) | 15-monitoring |
| 14 | Testing Strategy (Jest unit/integration, Playwright E2E, coverage targets) | 17-testing |
| 15 | Environment Setup | Existing + 04-deployment |
| 16 | Technology Stack | All docs |

### Task

- [ ] Write the complete CLAUDE.md to `G:\MindProject\MindFourm\CLAUDE.md` with all 16 sections
- [ ] Verify: no design document section is left uncovered
- [ ] Verify: all code paths, file names, and patterns match the actual codebase
- [ ] Verify: planned features (08, 09, 10) are clearly marked as "PLANNED - NOT IMPLEMENTED"
- [ ] Git diff review, then commit
