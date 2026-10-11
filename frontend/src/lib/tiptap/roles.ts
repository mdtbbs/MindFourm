/**
 * Role ranking, mirroring `ROLES` in `src/common/utils/constants.ts`.
 *
 * The frontend only uses this to decide whether to *show* an affordance. Every
 * staff-only capability is re-checked on the server, which is the boundary that
 * actually holds.
 */
const ROLE_RANK: Record<string, number> = { guest: 0, user: 1, moderator: 2, admin: 3, super_admin: 4 };

/** Moderator and above — the level that may author server-trusted HTML blocks. */
export function roleAllowsHtmlBlocks(role: string | null | undefined): boolean {
  return (ROLE_RANK[role || ''] ?? 0) >= ROLE_RANK.moderator;
}
