import {
  parsePrefixCatalog,
  validatePostType,
  getPrefixMetadata,
  getActivePrefixes,
  DEFAULT_POST_PREFIXES,
  PostPrefix,
} from './post-prefixes.util';

describe('post-prefixes.util', () => {
  const testCatalog: PostPrefix[] = [
    { value: 'normal', label: '普通', color: '#6b7280', active: true },
    { value: 'discussion', label: '讨论', color: '#3b82f6', active: true },
    { value: 'question', label: '提问', color: '#f59e0b', active: true },
    { value: 'archived', label: '已归档', color: '#9ca3af', active: false },
  ];

  describe('parsePrefixCatalog', () => {
    it('returns default catalog when setting is null', () => {
      expect(parsePrefixCatalog(null)).toEqual(DEFAULT_POST_PREFIXES);
    });

    it('returns default catalog when setting is undefined', () => {
      expect(parsePrefixCatalog(undefined)).toEqual(DEFAULT_POST_PREFIXES);
    });

    it('returns default catalog when JSON is invalid', () => {
      expect(parsePrefixCatalog('not-json')).toEqual(DEFAULT_POST_PREFIXES);
    });

    it('returns default catalog when parsed value is not an array', () => {
      expect(parsePrefixCatalog('{"foo":"bar"}')).toEqual(DEFAULT_POST_PREFIXES);
    });

    it('parses valid JSON catalog', () => {
      const json = JSON.stringify(testCatalog);
      expect(parsePrefixCatalog(json)).toEqual(testCatalog);
    });

    it('filters out invalid prefix entries', () => {
      const invalid = [
        { value: 'valid', label: 'Valid', color: '#000', active: true },
        { value: 123, label: 'Invalid', color: '#000', active: true },
        { value: 'missing-label', color: '#000', active: true },
      ];
      const result = parsePrefixCatalog(JSON.stringify(invalid));
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('valid');
    });
  });

  describe('validatePostType', () => {
    it('returns "normal" for null/undefined postType', () => {
      expect(validatePostType(null, testCatalog)).toBe('normal');
      expect(validatePostType(undefined, testCatalog)).toBe('normal');
    });

    it('returns "normal" for explicit "normal"', () => {
      expect(validatePostType('normal', testCatalog)).toBe('normal');
    });

    it('returns the value if it exists in catalog and is active', () => {
      expect(validatePostType('discussion', testCatalog)).toBe('discussion');
      expect(validatePostType('question', testCatalog)).toBe('question');
    });

    it('returns "normal" if the prefix is not active', () => {
      expect(validatePostType('archived', testCatalog)).toBe('normal');
    });

    it('returns "normal" for unknown values', () => {
      expect(validatePostType('unknown', testCatalog)).toBe('normal');
    });
  });

  describe('getPrefixMetadata', () => {
    it('returns the prefix metadata for a valid value', () => {
      const result = getPrefixMetadata('discussion', testCatalog);
      expect(result).toEqual({
        value: 'discussion',
        label: '讨论',
        color: '#3b82f6',
        active: true,
      });
    });

    it('returns null for unknown values', () => {
      expect(getPrefixMetadata('unknown', testCatalog)).toBeNull();
    });
  });

  describe('getActivePrefixes', () => {
    it('returns only active prefixes', () => {
      const result = getActivePrefixes(testCatalog);
      expect(result).toHaveLength(3);
      expect(result.every((p) => p.active)).toBe(true);
    });
  });
});
