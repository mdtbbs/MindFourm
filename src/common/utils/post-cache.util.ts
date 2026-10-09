/**
 * Post-derived Redis cache keys.
 *
 * `post:detail:<version>:<id>` is written by `PostsService.findById` and dropped
 * whenever a post or one of its replies changes. The key used to be spelled out
 * as a literal in four places, with three different versions, so a version bump
 * silently left the moderation writes invalidating a key that no longer existed —
 * an approved or rejected post kept serving its pre-moderation payload for the
 * full 5-minute TTL.
 *
 * `post:view:<id>` is the per-viewer throttle for `incrementViewCount`. It was
 * being deleted alongside the detail key, which reset the 60-second window on
 * every reply and re-opened the same counter to rapid increments. Invalidation
 * helpers take the id alone and derive this key, so the throttle is never
 * dropped by accident.
 */
export const POST_DETAIL_CACHE_PREFIX = 'post:detail:v6:';

export function postDetailCacheKey(postId: number): string {
  return `${POST_DETAIL_CACHE_PREFIX}${postId}`;
}

export function postViewThrottleKey(postId: number): string {
  return `post:view:${postId}`;
}
