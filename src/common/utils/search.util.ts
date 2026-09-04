/**
 * Escape special characters for MySQL LIKE queries
 * Characters that need escaping: %, _, \
 * - % matches any sequence of characters
 * - _ matches any single character
 * - \ is the escape character itself
 * @param input The raw user input string
 * @returns Escaped string safe for use in LIKE queries
 */
export function escapeLike(input: string): string {
  return input.replace(/([%_\\])/g, '\\$1');
}