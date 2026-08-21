const LEGACY_HTML_PATTERN = /(?:<|&lt;)\/?(?:p|div|br|h[1-6]|ul|ol|li|blockquote|strong|b|em|i|code|pre|a|img)(?:\s|\/?>|&gt;)/i;

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hexadecimal = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (Number.isFinite(codePoint)) {
        try { return String.fromCodePoint(codePoint); } catch { return match; }
      }
      return match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

/**
 * Converts legacy editor HTML wrappers into Markdown-compatible text. The
 * result is still rendered by ReactMarkdown/React; HTML is never injected.
 */
export function normalizeStoredContent(content: string): string {
  if (!LEGACY_HTML_PATTERN.test(content)) return content;

  return decodeHtmlEntities(content)
    .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, (_match, alt: string) => alt || '图片')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p\b[^>]*>/gi, '')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/(?:div|h[1-6]|ul|ol|blockquote|pre)\s*>/gi, '\n\n')
    .replace(/<(?:div|h[1-6]|ul|ol|blockquote|pre)\b[^>]*>/gi, '')
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function toContentExcerpt(content: string): string {
  return normalizeStoredContent(content)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) => alt || '图片')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
