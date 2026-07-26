const MAX_DESCRIPTION_LENGTH = 160;

/**
 * Turn Markdown into a plain-text meta description.
 *
 * Post descriptions used to be `content.slice(0, 160)` straight from the raw
 * Markdown, so `##`, `**`, `[](…)` and code fences leaked into search snippets, and
 * the cut could land mid-word or mid-entity.
 */
export function toMetaDescription(
  markdown: string | null | undefined,
  maxLength = MAX_DESCRIPTION_LENGTH,
): string {
  if (!markdown) return '';

  const text = markdown
    // Fenced and inline code: keep the words, drop the fences.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    // Images before links, so alt text does not survive as a stray label.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Headings, blockquotes and list markers at line starts.
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    // Emphasis and strikethrough markers.
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Horizontal rules, residual HTML tags, then collapse whitespace.
    .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return truncateOnWordBoundary(text, maxLength);
}

/**
 * Trim to `maxLength`, preferring the last word boundary so the snippet does not end
 * mid-word.
 */
export function truncateOnWordBoundary(text: string, maxLength = MAX_DESCRIPTION_LENGTH): string {
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');

  // CJK text has no spaces; a hard cut is correct there.
  const base = lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${base.trimEnd()}…`;
}
