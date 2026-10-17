import {
  POST_DETAIL_CACHE_PREFIX,
  postDetailCacheKey,
  postViewThrottleKey,
} from './post-cache.util';

describe('post cache keys', () => {
  it('builds the detail key from the single shared version prefix', () => {
    expect(POST_DETAIL_CACHE_PREFIX).toBe('post:detail:v6:');
    expect(postDetailCacheKey(88)).toBe('post:detail:v6:88');
  });

  it('keeps the view-count throttle on its own, non-versioned key', () => {
    // The throttle is rate-limiting state. Tying it to the detail-cache version
    // would make a future bump stop clearing it, or start clearing it by accident.
    expect(postViewThrottleKey(88)).toBe('post:view:88');
    expect(postViewThrottleKey(88)).not.toBe(postDetailCacheKey(88));
  });
});
