import { persistSlug, backfillSlugs } from './slug-persistence.util';

describe('slug-persistence.util', () => {
  describe('persistSlug', () => {
    it('generates a unique slug when no duplicates exist', async () => {
      const countFn = jest.fn().mockResolvedValue(0);
      const result = await persistSlug('Hello World', countFn);
      expect(result).toBe('hello-world');
      expect(countFn).toHaveBeenCalledWith('hello-world');
    });

    it('appends a suffix when duplicates exist', async () => {
      const countFn = jest.fn().mockResolvedValue(2);
      const result = await persistSlug('Hello World', countFn);
      expect(result).toBe('hello-world-3');
    });

    it('generates a fallback slug for empty titles', async () => {
      const countFn = jest.fn().mockResolvedValue(0);
      const result = await persistSlug('', countFn);
      expect(result).toMatch(/^untitled-\d+$/);
    });

    it('generates a fallback slug for null titles', async () => {
      const countFn = jest.fn().mockResolvedValue(0);
      const result = await persistSlug(null as any, countFn);
      expect(result).toMatch(/^untitled-\d+$/);
    });
  });

  describe('backfillSlugs', () => {
    it('updates slugs for all records with titles', async () => {
      const records = [
        { id: 1, title: 'First Post' },
        { id: 2, title: 'Second Post' },
      ];
      const updateFn = jest.fn().mockResolvedValue(undefined);
      const countFn = jest.fn().mockResolvedValue(0);

      const result = await backfillSlugs(records, updateFn, countFn);

      expect(result).toBe(2);
      expect(updateFn).toHaveBeenCalledTimes(2);
      expect(updateFn).toHaveBeenCalledWith(1, 'first-post');
      expect(updateFn).toHaveBeenCalledWith(2, 'second-post');
    });

    it('skips records without titles', async () => {
      const records = [
        { id: 1, title: 'First Post' },
        { id: 2, title: '' },
      ];
      const updateFn = jest.fn().mockResolvedValue(undefined);
      const countFn = jest.fn().mockResolvedValue(0);

      const result = await backfillSlugs(records, updateFn, countFn);

      expect(result).toBe(1);
      expect(updateFn).toHaveBeenCalledTimes(1);
    });
  });
});
