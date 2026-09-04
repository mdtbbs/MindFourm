import { generateSlug, makeUniqueSlug, buildHybridParam, extractIdFromHybridParam } from './url-slug.util';

/**
 * Covers the cases that made the previous inline slug expression in
 * `PostsService.attachTags` produce collisions on the UNIQUE `tags.slug` index.
 */
describe('generateSlug (CJK and collision cases)', () => {
  it('preserves CJK characters instead of stripping them to nothing', () => {
    // The old expression used `[^\w-]`, and JS `\w` excludes CJK — so every Chinese
    // tag reduced to an empty slug and two of them on one post violated the index.
    expect(generateSlug('模组')).toBe('模组');
    expect(generateSlug('地图编辑器')).toBe('地图编辑器');
    expect(generateSlug('教程')).not.toBe('');
  });

  it('produces different slugs for different CJK names', () => {
    expect(generateSlug('模组')).not.toBe(generateSlug('教程'));
  });

  it('normalises spacing and punctuation', () => {
    expect(generateSlug('  Hello   World  ')).toBe('hello-world');
    expect(generateSlug('Hello_World')).toBe('hello-world');
    expect(generateSlug('C++ / Rust!')).toBe('c-rust');
    expect(generateSlug('--leading--and--trailing--')).toBe('leading-and-trailing');
  });

  it('returns an empty string when nothing survives, so callers can fall back', () => {
    expect(generateSlug('!!!')).toBe('');
    expect(generateSlug('   ')).toBe('');
    expect(generateSlug('')).toBe('');
  });

  it('caps length', () => {
    expect(generateSlug('a'.repeat(200))).toHaveLength(80);
  });
});

describe('makeUniqueSlug', () => {
  it('leaves the first occurrence untouched', () => {
    expect(makeUniqueSlug('my-post', 0)).toBe('my-post');
  });

  it('suffixes subsequent occurrences', () => {
    expect(makeUniqueSlug('my-post', 1)).toBe('my-post-2');
    expect(makeUniqueSlug('my-post', 4)).toBe('my-post-5');
  });

  it('returns empty for an empty base', () => {
    expect(makeUniqueSlug('', 3)).toBe('');
  });
});

describe('hybrid params', () => {
  it('round-trips an id and slug', () => {
    const param = buildHybridParam(123, 'my-post');
    expect(param).toBe('123-my-post');
    expect(extractIdFromHybridParam(param)).toBe(123);
  });

  it('falls back to the bare id when there is no slug', () => {
    expect(buildHybridParam(123, '')).toBe('123');
    expect(extractIdFromHybridParam('123')).toBe(123);
  });

  it('reads the id regardless of what follows it', () => {
    // Any suffix resolves to the same post, which is why these URLs need a canonical.
    expect(extractIdFromHybridParam('123-literally-anything')).toBe(123);
    expect(extractIdFromHybridParam('123-模组')).toBe(123);
  });

  it('rejects params with no numeric prefix', () => {
    expect(extractIdFromHybridParam('abc')).toBeNull();
    expect(extractIdFromHybridParam('')).toBeNull();
    expect(extractIdFromHybridParam('-5')).toBeNull();
    expect(extractIdFromHybridParam('0')).toBeNull();
  });
});
