/**
 * URL slug generation utilities for SEO-friendly URLs.
 *
 * Generates URL-safe slugs from titles, handling CJK characters,
 * special characters, and duplicate prevention.
 */

/**
 * Generate a URL-safe slug from a title string.
 * - Converts to lowercase
 * - Replaces spaces with hyphens
 * - Removes special characters except hyphens and CJK characters
 * - Collapses multiple hyphens
 * - Trims leading/trailing hyphens
 * - Limits length to 80 characters
 */
export function generateSlug(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  return title
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Keep alphanumeric, hyphens, and CJK characters
    .replace(/[^\w一-鿿㐀-䶿　-〿-]/g, '')
    // Collapse multiple hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length
    .slice(0, 80);
}

/**
 * Generate a unique slug by appending a numeric suffix if needed.
 * @param baseSlug - The base slug to make unique
 * @param existingCount - Number of existing records with this slug
 */
export function makeUniqueSlug(baseSlug: string, existingCount: number): string {
  if (!baseSlug) {
    return '';
  }

  if (existingCount === 0) {
    return baseSlug;
  }

  return `${baseSlug}-${existingCount + 1}`;
}

/**
 * Extract numeric ID from a hybrid URL param like "123-my-post-title".
 * Returns null if no numeric prefix is found.
 */
export function extractIdFromHybridParam(param: string): number | null {
  if (!param || typeof param !== 'string') {
    return null;
  }

  const match = param.match(/^(\d+)(?:-|$)/);
  if (!match) {
    return null;
  }

  const id = parseInt(match[1], 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Build a hybrid URL param from an ID and slug.
 * Format: "id-slug" (e.g., "123-my-post-title")
 */
export function buildHybridParam(id: number, slug: string): string {
  if (!id || !slug) {
    return String(id);
  }

  return `${id}-${slug}`;
}
