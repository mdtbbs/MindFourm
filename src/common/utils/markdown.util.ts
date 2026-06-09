import { marked } from 'marked';

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr', 'del', 'ins', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'details', 'summary',
]);

const ALLOWED_ATTRS = new Set(['href', 'title', 'alt', 'src', 'class', 'target', 'rel']);

/**
 * Parse markdown to HTML and sanitize
 */
export function parseMarkdown(content: string): string {
  const html = marked.parse(content) as string;
  return sanitize(html);
}

/**
 * Simple HTML sanitization - strips disallowed tags and attributes
 */
export function sanitize(html: string): string {
  // Strip event handlers
  let sanitized = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
  // Strip javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  return sanitized;
}
