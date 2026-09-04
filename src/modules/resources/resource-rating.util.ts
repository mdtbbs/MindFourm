/**
 * Resource rating calculation utilities.
 *
 * Handles rating validation, aggregate computation, and normalization
 * for the resource rating subsystem.
 */

/** Minimum allowed rating value (1-5 scale) */
export const MIN_RATING = 1;
/** Maximum allowed rating value (1-5 scale) */
export const MAX_RATING = 5;

/**
 * Validate a rating value is within the allowed range.
 * Returns true if valid, false otherwise.
 */
export function isValidRating(rating: unknown): boolean {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    return false;
  }

  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING;
}

/**
 * Calculate the average rating from count and sum.
 * Returns 0 if count is 0 to avoid division by zero.
 */
export function calculateAverageRating(ratingCount: number, ratingSum: number): number {
  if (ratingCount <= 0) {
    return 0;
  }

  const average = ratingSum / ratingCount;
  // Round to 2 decimal places
  return Math.round(average * 100) / 100;
}

/**
 * Compute how a rating change shifts the denormalized aggregate columns.
 *
 * Deltas rather than absolute values, so callers can express the update as
 * `rating_count = rating_count + ?` in SQL. Deriving absolutes from a prior
 * SELECT is what let two concurrent raters each overwrite the other's
 * contribution and corrupt `rating_count`/`rating_sum` permanently.
 *
 * @param oldRating - The previous rating value (null if newly rated)
 * @param newRating - The new rating value (null if the rating is being removed)
 */
export function ratingAggregateDelta(
  oldRating: number | null,
  newRating: number | null,
): { countDelta: number; sumDelta: number } {
  let countDelta = 0;
  let sumDelta = 0;

  // Remove old rating if it exists
  if (oldRating !== null) {
    countDelta -= 1;
    sumDelta -= oldRating;
  }

  // Add new rating if it exists
  if (newRating !== null) {
    countDelta += 1;
    sumDelta += newRating;
  }

  return { countDelta, sumDelta };
}

/**
 * Update aggregate columns after a rating change.
 * This is used to maintain denormalized rating_count, rating_sum, and rating_average
 * on the resources table.
 *
 * @param currentCount - Current rating_count value
 * @param currentSum - Current rating_sum value
 * @param oldRating - The previous rating value (null if new rating)
 * @param newRating - The new rating value (null if deleting rating)
 * @returns Updated aggregates { rating_count, rating_sum, rating_average }
 */
export function updateRatingAggregates(
  currentCount: number,
  currentSum: number,
  oldRating: number | null,
  newRating: number | null,
): { rating_count: number; rating_sum: number; rating_average: number } {
  const { countDelta, sumDelta } = ratingAggregateDelta(oldRating, newRating);

  // Ensure non-negative values
  const count = Math.max(0, currentCount + countDelta);
  const sum = Math.max(0, currentSum + sumDelta);

  return {
    rating_count: count,
    rating_sum: sum,
    rating_average: calculateAverageRating(count, sum),
  };
}

/**
 * Allowed sort keys for resource list queries.
 * This is an allowlist to prevent arbitrary sort values.
 */
export const RESOURCE_SORT_ALLOWLIST = [
  'created_at',
  'updated_at',
  'download_count',
  'rating_average',
  'rating_count',
] as const;

export type ResourceSortKey = (typeof RESOURCE_SORT_ALLOWLIST)[number];

/**
 * Validate that a sort key is in the allowed list.
 * Returns the validated sort key or the default 'created_at'.
 */
export function validateResourceSort(sort: string | undefined): ResourceSortKey {
  if (!sort) {
    return 'created_at';
  }

  if (RESOURCE_SORT_ALLOWLIST.includes(sort as ResourceSortKey)) {
    return sort as ResourceSortKey;
  }

  return 'created_at';
}
