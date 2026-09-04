import {
  isValidRating,
  calculateAverageRating,
  updateRatingAggregates,
  validateResourceSort,
  RESOURCE_SORT_ALLOWLIST,
} from './resource-rating.util';

describe('resource-rating.util', () => {
  describe('isValidRating', () => {
    it('accepts integers from 1 to 5', () => {
      expect(isValidRating(1)).toBe(true);
      expect(isValidRating(3)).toBe(true);
      expect(isValidRating(5)).toBe(true);
    });

    it('rejects values outside range', () => {
      expect(isValidRating(0)).toBe(false);
      expect(isValidRating(6)).toBe(false);
      expect(isValidRating(-1)).toBe(false);
    });

    it('rejects non-integers', () => {
      expect(isValidRating(3.5)).toBe(false);
      expect(isValidRating(2.1)).toBe(false);
    });

    it('rejects non-numbers', () => {
      expect(isValidRating('3')).toBe(false);
      expect(isValidRating(null)).toBe(false);
      expect(isValidRating(undefined)).toBe(false);
      expect(isValidRating(NaN)).toBe(false);
    });
  });

  describe('calculateAverageRating', () => {
    it('returns 0 when count is 0', () => {
      expect(calculateAverageRating(0, 0)).toBe(0);
    });

    it('calculates average correctly', () => {
      expect(calculateAverageRating(3, 12)).toBe(4);
      expect(calculateAverageRating(2, 7)).toBe(3.5);
    });

    it('rounds to 2 decimal places', () => {
      expect(calculateAverageRating(3, 10)).toBe(3.33);
      expect(calculateAverageRating(7, 20)).toBe(2.86);
    });
  });

  describe('updateRatingAggregates', () => {
    it('adds a new rating', () => {
      const result = updateRatingAggregates(0, 0, null, 4);
      expect(result).toEqual({
        rating_count: 1,
        rating_sum: 4,
        rating_average: 4,
      });
    });

    it('updates an existing rating', () => {
      const result = updateRatingAggregates(2, 7, 3, 5);
      expect(result).toEqual({
        rating_count: 2,
        rating_sum: 9,
        rating_average: 4.5,
      });
    });

    it('deletes a rating', () => {
      const result = updateRatingAggregates(2, 7, 3, null);
      expect(result).toEqual({
        rating_count: 1,
        rating_sum: 4,
        rating_average: 4,
      });
    });

    it('handles edge case of deleting last rating', () => {
      const result = updateRatingAggregates(1, 4, 4, null);
      expect(result).toEqual({
        rating_count: 0,
        rating_sum: 0,
        rating_average: 0,
      });
    });

    it('ensures non-negative values', () => {
      const result = updateRatingAggregates(0, 0, null, null);
      expect(result).toEqual({
        rating_count: 0,
        rating_sum: 0,
        rating_average: 0,
      });
    });
  });

  describe('validateResourceSort', () => {
    it('returns the sort key if it is in the allowlist', () => {
      expect(validateResourceSort('created_at')).toBe('created_at');
      expect(validateResourceSort('rating_average')).toBe('rating_average');
      expect(validateResourceSort('rating_count')).toBe('rating_count');
      expect(validateResourceSort('download_count')).toBe('download_count');
    });

    it('returns "created_at" for undefined', () => {
      expect(validateResourceSort(undefined)).toBe('created_at');
    });

    it('returns "created_at" for unknown sort keys', () => {
      expect(validateResourceSort('unknown')).toBe('created_at');
      expect(validateResourceSort('id')).toBe('created_at');
    });

    it('includes all expected sort keys in the allowlist', () => {
      expect(RESOURCE_SORT_ALLOWLIST).toContain('created_at');
      expect(RESOURCE_SORT_ALLOWLIST).toContain('updated_at');
      expect(RESOURCE_SORT_ALLOWLIST).toContain('download_count');
      expect(RESOURCE_SORT_ALLOWLIST).toContain('rating_average');
      expect(RESOURCE_SORT_ALLOWLIST).toContain('rating_count');
    });
  });
});
