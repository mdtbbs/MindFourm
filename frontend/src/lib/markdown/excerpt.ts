import { toContentExcerpt } from '@/lib/content/normalize-content';

/**
 * Convert a Markdown-ish field into a compact plain-text excerpt for list cards.
 * Resource descriptions can use the rich editor, but cards should not show raw
 * image syntax, URLs, or formatting markers in their one-line summary.
 */
export function markdownToPlainExcerpt(
  value: string | null | undefined,
  fallback = '暂无短介绍',
): string {
  if (!value) return fallback;

  const text = toContentExcerpt(value);

  return text || fallback;
}
