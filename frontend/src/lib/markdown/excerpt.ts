const IMAGE_MARKDOWN_PATTERN = /!\[[^\]]*\]\([^)]*\)/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]*\)/g;
const MARKDOWN_SYNTAX_PATTERN = /[`*_~>#|\-=]+/g;
const WHITESPACE_PATTERN = /\s+/g;

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

  const text = value
    .replace(IMAGE_MARKDOWN_PATTERN, '')
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(HTML_TAG_PATTERN, '')
    .replace(MARKDOWN_SYNTAX_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();

  return text || fallback;
}
