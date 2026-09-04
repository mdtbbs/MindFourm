/**
 * Notice parsing and validation utilities.
 *
 * Shared between:
 * - frontend/src/app/(public)/notices/page.tsx (public display)
 * - frontend/src/app/admin/settings/announce/page.tsx (admin management)
 */

export interface Notice {
  title: string;
  content: string;
  published_at?: string;
  pinned?: boolean;
}

/**
 * Parse and validate notices from raw JSON string.
 *
 * Validation rules:
 * - title: required, must be non-empty string
 * - content: required, must be string
 * - published_at: optional, only string values are kept
 * - pinned: optional, only strict true values are kept
 * - Invalid records are silently ignored
 * - Malformed JSON returns empty array (never throws)
 * - Maximum 50 records returned
 *
 * Sort order:
 * - pinned=true first
 * - Same pinned status: sorted by published_at descending
 */
export function parseNotices(raw: string | undefined): Notice[] {
  // Empty or whitespace-only input
  if (!raw?.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON - return empty array, don't crash the page
    return [];
  }

  // Must be an array
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item): item is Record<string, unknown> => {
      // Must be a non-null object
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }
      // title must be a non-empty string
      if (typeof item.title !== 'string' || !item.title.trim()) {
        return false;
      }
      // content must be a string
      if (typeof item.content !== 'string') {
        return false;
      }
      return true;
    })
    .slice(0, 50)
    .map((item) => ({
      title: String(item.title).trim(),
      content: String(item.content),
      // Only keep string values for published_at
      published_at: typeof item.published_at === 'string' ? item.published_at : undefined,
      // Only keep strict true values for pinned
      pinned: item.pinned === true,
    }))
    .sort((a, b) => {
      // pinned=true first
      const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinnedDiff !== 0) return pinnedDiff;
      // Then by published_at descending
      return String(b.published_at || '').localeCompare(String(a.published_at || ''));
    });
}