/**
 * Post prefix validation utilities.
 *
 * Thread prefixes are modeled as a settings-backed catalog that defines
 * allowed post_type values, labels, colors, and whether the prefix is active.
 * The prefix catalog is stored as a JSON setting (e.g., 'post_prefixes').
 */

export interface PostPrefix {
  /** The stored post_type value */
  value: string;
  /** Human-readable label */
  label: string;
  /** CSS color for rendering (e.g., '#ff6b35') */
  color: string;
  /** Whether this prefix is currently active/available */
  active: boolean;
}

/**
 * Default prefix catalog when no settings are configured.
 * Includes common forum prefixes.
 */
export const DEFAULT_POST_PREFIXES: PostPrefix[] = [
  { value: 'normal', label: '普通', color: '#6b7280', active: true },
  { value: 'discussion', label: '讨论', color: '#3b82f6', active: true },
  { value: 'question', label: '提问', color: '#f59e0b', active: true },
  { value: 'announcement', label: '公告', color: '#ef4444', active: true },
  { value: 'tutorial', label: '教程', color: '#10b981', active: true },
  { value: 'showcase', label: '展示', color: '#8b5cf6', active: true },
];

/**
 * Parse the post prefix catalog from a JSON setting value.
 * Returns the default catalog if parsing fails or value is null/undefined.
 */
export function parsePrefixCatalog(settingValue: string | null | undefined): PostPrefix[] {
  if (!settingValue) {
    return DEFAULT_POST_PREFIXES;
  }

  try {
    const parsed = JSON.parse(settingValue);
    if (!Array.isArray(parsed)) {
      return DEFAULT_POST_PREFIXES;
    }

    // Validate each prefix has required fields
    const validPrefixes = parsed.filter(
      (item: any) =>
        item &&
        typeof item.value === 'string' &&
        typeof item.label === 'string' &&
        typeof item.color === 'string' &&
        typeof item.active === 'boolean',
    );

    return validPrefixes.length > 0 ? validPrefixes : DEFAULT_POST_PREFIXES;
  } catch {
    return DEFAULT_POST_PREFIXES;
  }
}

/**
 * Validate that a post_type value is in the allowed catalog.
 * Returns the validated value or the default 'normal' if invalid.
 */
export function validatePostType(
  postType: string | undefined | null,
  catalog: PostPrefix[],
): string {
  if (!postType) {
    return 'normal';
  }

  // 'normal' is always valid as the default/no-prefix state
  if (postType === 'normal') {
    return 'normal';
  }

  // Check if the value exists in the catalog and is active
  const prefix = catalog.find((p) => p.value === postType);
  if (prefix && prefix.active) {
    return postType;
  }

  return 'normal';
}

/**
 * Get prefix metadata for a given post_type value.
 * Returns null if the prefix is not found in the catalog.
 */
export function getPrefixMetadata(
  postType: string,
  catalog: PostPrefix[],
): PostPrefix | null {
  return catalog.find((p) => p.value === postType) || null;
}

/**
 * Get all active prefixes from the catalog.
 */
export function getActivePrefixes(catalog: PostPrefix[]): PostPrefix[] {
  return catalog.filter((p) => p.active);
}
