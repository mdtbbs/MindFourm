# Independent Site Profiles

MindFourm can run as MDTBBS or Mindustry Club from the same repository. A process serves one profile only; the two deployments do not share forum data.

## Deployment values

Set the backend and frontend profile to the same value:

```env
# MDTBBS
SITE_PROFILE=mdtbbs
```

```env
# Mindustry Club
SITE_PROFILE=mindustry-club
FRONTEND_URL=https://mindustry.club
API_URL=https://mindustry.club
MINDAUTH_URL=https://auth.mdtbbs.cn
MINDAUTH_CLIENT_ID=<club-oauth-client-id>
MINDAUTH_CLIENT_SECRET=<club-oauth-client-secret>
MINDAUTH_CALLBACK_URL=https://mindustry.club/api/auth/callback
RESOURCE_UPLOAD_ROOT=/srv/mindustry-club/uploads
```

Build the Next.js frontend with the matching setting:

```env
NEXT_PUBLIC_SITE_PROFILE=mindustry-club
NEXT_PUBLIC_SITE_URL=https://mindustry.club
NEXT_PUBLIC_API_URL=https://mindustry.club
NEXT_PUBLIC_MINDAUTH_URL=https://auth.mdtbbs.cn
NEXT_PUBLIC_MINDAUTH_CLIENT_ID=<club-oauth-client-id>
```

Create a dedicated MindAuth OAuth Client for Club and set its ecosystem to `mindustry-club`; keep MDTBBS's existing Client in the `mdtbbs` ecosystem. MindAuth redirects to the exact callback registered for that client. Do not reuse the MDTBBS Client secret.

## Data isolation

Use separate MySQL databases, Redis instances or databases, upload volumes, backups, and operational credentials. Apply the same explicit TypeORM migrations to each forum database. Do not enable `synchronize`. The Club seed pack is inserted only when a setting is absent, so later process starts do not overwrite operator changes.

Resources include nullable `origin_site`, `origin_resource_id`, and `origin_url` columns for a future trusted manual import/export workflow. They are deliberately separate from user-editable metadata, so ordinary uploads cannot forge provenance. A resource imported into another profile remains a local resource there: moderation, comments, ratings, saves, downloads, and files are not shared. The phase-one migration provides storage only; it does not introduce a cross-site sync API or admin control.

Each forum creates local users keyed by `mindauth_id`. Roles, bans, posts, replies, messages, moderation, resources, and downloads remain local to that deployment. Club public resource downloads remain anonymous but still require a public resource state, active category, and valid managed file or safe external URL.

## Profile behavior

| Policy | MDTBBS | Mindustry Club |
|---|---|---|
| UI locales | `zh-CN` | `en`, `ru`, `ja` |
| Email required for community writes | yes | yes |
| Phone required for community writes | yes | no |
| Default resource moderation | yes | no; content-safety flags can still require review |
| Server applications / LanLink / developer feed | enabled by existing profile | disabled |
| Server directory | existing MDTBBS directory | independent public directory remains available |

Public `/api/v1/capabilities` reports profile, locales, features, and verification requirements. Stable API codes such as `EMAIL_VERIFICATION_REQUIRED`, `PHONE_VERIFICATION_REQUIRED`, `TERMS_ACCEPTANCE_REQUIRED`, and `RESOURCE_UPLOAD_DISABLED` are intended for clients to translate.

## Migrations and operations

The international fields migration adds local `email_verified`, `preferred_locale`, and `content_language` columns. The previous local schema did not record an authoritative verification bit, so the migration does not infer verification from an email address or MindAuth link. Existing members can browse and sign in; their next MindAuth OAuth login syncs the authoritative email state before community writes are allowed. Plan a one-time reauthentication notice for members with existing forum sessions.

After migrations, check the capability payload and verify each profile with its own OAuth Client. For Club, confirm unauthenticated browsing and public downloads, and ensure the forum's MindAuth application has ecosystem `mindustry-club`. Never point both deployments at the same database, Redis keyspace, upload volume, or settings table.
