const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Whether a user-supplied URL is safe to put in an `href`.
 *
 * Blocks `javascript:`, `data:`, `vbscript:` and friends. The browser's
 * `<input type="url">` accepts `javascript:...` as valid, and the backend DTO only
 * had `@IsString()`, so a submitted resource could render a clickable link that
 * executed script on the forum's own origin. Rows created before the backend's
 * `@IsUrl` check landed can still hold such values, so this is checked at render
 * time too.
 */
export function isSafeHref(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  // Site-relative paths are fine, but never protocol-relative `//host`.
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }

  try {
    return ALLOWED_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

/**
 * The URL if it is safe to link to, otherwise undefined — so callers can omit the
 * `href` entirely rather than rendering a dead `#` link that looks clickable.
 */
export function safeHref(value: unknown): string | undefined {
  return isSafeHref(value) ? (value as string).trim() : undefined;
}
