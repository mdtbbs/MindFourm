import {
  generateSlug,
  makeUniqueSlug,
  extractIdFromHybridParam,
  buildHybridParam,
} from './url-slug.util';

describe('url-slug.util', () => {
  describe('generateSlug', () => {
    it('generates a lowercase slug with hyphens', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
    });

    it('removes special characters', () => {
      expect(generateSlug('Hello! @World# $Test')).toBe('hello-world-test');
    });

    it('collapses multiple hyphens', () => {
      expect(generateSlug('Hello   World---Test')).toBe('hello-world-test');
    });

    it('trims leading and trailing hyphens', () => {
      expect(generateSlug('  Hello World  ')).toBe('hello-world');
    });

    it('preserves CJK characters', () => {
      expect(generateSlug('测试 Test 标题')).toBe('测试-test-标题');
    });

    it('limits length to 80 characters', () => {
      const longTitle = 'a'.repeat(100);
      expect(generateSlug(longTitle).length).toBe(80);
    });

    it('returns empty string for null/undefined/empty input', () => {
      expect(generateSlug('')).toBe('');
      expect(generateSlug(null as any)).toBe('');
      expect(generateSlug(undefined as any)).toBe('');
    });

    it('replaces underscores with hyphens', () => {
      expect(generateSlug('hello_world_test')).toBe('hello-world-test');
    });
  });

  describe('makeUniqueSlug', () => {
    it('returns the base slug when no duplicates exist', () => {
      expect(makeUniqueSlug('hello-world', 0)).toBe('hello-world');
    });

    it('appends a numeric suffix when duplicates exist', () => {
      expect(makeUniqueSlug('hello-world', 1)).toBe('hello-world-2');
      expect(makeUniqueSlug('hello-world', 5)).toBe('hello-world-6');
    });

    it('returns empty string for empty base slug', () => {
      expect(makeUniqueSlug('', 0)).toBe('');
    });
  });

  describe('extractIdFromHybridParam', () => {
    it('extracts numeric ID from hybrid param', () => {
      expect(extractIdFromHybridParam('123-my-post-title')).toBe(123);
    });

    it('extracts ID when no slug follows', () => {
      expect(extractIdFromHybridParam('456')).toBe(456);
    });

    it('returns null for non-numeric params', () => {
      expect(extractIdFromHybridParam('my-post')).toBeNull();
    });

    it('returns null for empty/null/undefined', () => {
      expect(extractIdFromHybridParam('')).toBeNull();
      expect(extractIdFromHybridParam(null as any)).toBeNull();
      expect(extractIdFromHybridParam(undefined as any)).toBeNull();
    });

    it('returns null for zero or negative IDs', () => {
      expect(extractIdFromHybridParam('0-post')).toBeNull();
    });
  });

  describe('buildHybridParam', () => {
    it('builds hybrid param from ID and slug', () => {
      expect(buildHybridParam(123, 'my-post-title')).toBe('123-my-post-title');
    });

    it('returns just the ID when slug is empty', () => {
      expect(buildHybridParam(123, '')).toBe('123');
    });

    it('returns just the ID when slug is null/undefined', () => {
      expect(buildHybridParam(123, null as any)).toBe('123');
    });
  });
});
