# Mindustry Club production readiness

Run `npm run readiness:production` with the Club production configuration loaded before approving a release. The command is read-only: it reads environment configuration, checks the existing MySQL migration ledger, and sends Redis `PING`. It does not run migrations, write settings, create keys, or modify content.

The check requires explicit comparison values for the existing MDTBBS service so it can verify the Club has:

- Matching `SITE_PROFILE=mindustry-club` and `NEXT_PUBLIC_SITE_PROFILE=mindustry-club`.
- A public HTTPS `NEXT_PUBLIC_SITE_URL` on the Mindustry Club domain.
- A MySQL database different from `MDTBBS_MYSQL_DATABASE`.
- A different Redis host/port or logical database from `MDTBBS_REDIS_HOST`, `MDTBBS_REDIS_PORT`, and `MDTBBS_REDIS_DB`.
- An absolute `RESOURCE_UPLOAD_ROOT` different from `MDTBBS_RESOURCE_UPLOAD_ROOT`.
- An explicit `MINDAUTH_CLIENT_ID`, `MINDAUTH_CLIENT_ECOSYSTEM=mindustry-club`, and server-only `MINDAUTH_CLIENT_SECRET`.
- Applied migrations `1720000120000` and `1720000130000`.

Keep OAuth secrets out of `NEXT_PUBLIC_*` variables and client bundles. Verify the approved client, exact redirect URI allowlist, and provider-side callback registration with the MindAuth readiness command and the real browser login flow. This check does not contact or change production unless an operator runs it with production connection settings.

## Remaining untranslated surfaces

The Club-facing post/reply and feedback forms, resource submission/editing/comments, attachment upload, bookmarks, submitted-resource management, blocked-user settings, challenge prompt, and common account/community workflows have English, Russian, Japanese, and Simplified Chinese copy. The remaining Chinese-only interface is concentrated in the MDTBBS administration console and domestic operations: phone verification, LanLink/EasyManager settings, server applications, and legacy moderation/configuration screens. User-authored category/resource labels and free-form validation prose returned by older APIs are data, not catalog strings; stable API error codes remain the client localization contract.
