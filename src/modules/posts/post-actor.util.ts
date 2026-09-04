import { ROLES, RoleName } from '@common/utils/constants';

/** The authenticated caller, as `JwtAuthGuard` puts it on the request. */
export interface PostActor {
  id: number;
  role: string;
}

/**
 * Whether the actor holds at least moderator rank.
 *
 * Compared by level rather than by membership of `['admin', 'moderator']`, because
 * that list silently excludes `super_admin` — which sits above admin and passes every
 * `@Roles('moderator', 'admin')` guard, so a literal list would let the route through
 * and then have the service refuse it.
 *
 * Shared by the post moderation actions and the revision reader so the two cannot
 * drift into disagreeing about who counts as staff.
 */
export function isStaffActor(actor: PostActor | undefined | null): boolean {
  if (!actor) return false;
  return (ROLES[actor.role as RoleName] ?? ROLES.guest) >= ROLES.moderator;
}
