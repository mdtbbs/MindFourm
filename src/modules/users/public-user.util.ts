/**
 * Strip private fields from a user record before it leaves the API.
 *
 * `GET /api/users/:id` and `/api/users/search` are unauthenticated and used to
 * return the whole entity, which exposed `email`, `mindauth_id`, `phone_verified`,
 * the point balances and every email-notification preference — walking the id range
 * dumped the membership table with addresses.
 *
 * Implemented as a denylist of private columns rather than an allowlist of public
 * ones so that computed extras callers attach (`post_count`, `reply_count`, level
 * and badge data) pass through untouched.
 */
const PRIVATE_USER_FIELDS = [
  'email',
  'mindauth_id',
  'pending_avatar_url',
  'available_points',
  'reply_email',
  'mention_email',
  'message_email',
  'system_email',
  'digest_email',
  'phone_verified',
  'phone_verified_at',
] as const;

export function toPublicUser<T extends Record<string, any>>(user: T): Partial<T> {
  if (!user) {
    return user;
  }

  const result: Record<string, any> = { ...user };
  for (const field of PRIVATE_USER_FIELDS) {
    delete result[field];
  }
  return result as Partial<T>;
}

export function toPublicUsers<T extends Record<string, any>>(users: T[]): Partial<T>[] {
  return (users || []).map((user) => toPublicUser(user));
}
