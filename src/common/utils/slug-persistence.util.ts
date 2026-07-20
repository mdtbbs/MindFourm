/**
 * Slug persistence utilities for backfilling and maintaining slugs
 * on existing entities that don't yet have slug values.
 */

import { generateSlug, makeUniqueSlug } from './url-slug.util';

/**
 * Generate a slug for a record, ensuring uniqueness by checking existing slugs.
 * This is used both for new records and for backfilling existing records.
 *
 * @param title - The title to generate a slug from
 * @param countExistingSlugs - Function that counts how many records already have a given slug
 * @returns A unique slug string
 */
export async function persistSlug(
  title: string,
  countExistingSlugs: (slug: string) => Promise<number>,
): Promise<string> {
  const baseSlug = generateSlug(title);

  if (!baseSlug) {
    // Fallback for empty/invalid titles
    return `untitled-${Date.now()}`;
  }

  const existingCount = await countExistingSlugs(baseSlug);
  return makeUniqueSlug(baseSlug, existingCount);
}

/**
 * Backfill slugs for a batch of records that don't have slugs yet.
 * This is useful for migrating existing data to use slugs.
 *
 * @param records - Array of records with id and title
 * @param updateSlug - Function to update a record's slug by ID
 * @param countExistingSlugs - Function that counts how many records already have a given slug
 * @returns Number of records updated
 */
export async function backfillSlugs<T extends { id: number; title: string }>(
  records: T[],
  updateSlug: (id: number, slug: string) => Promise<void>,
  countExistingSlugs: (slug: string) => Promise<number>,
): Promise<number> {
  let updatedCount = 0;

  for (const record of records) {
    if (!record.title) {
      continue;
    }

    const slug = await persistSlug(record.title, countExistingSlugs);
    await updateSlug(record.id, slug);
    updatedCount++;
  }

  return updatedCount;
}
