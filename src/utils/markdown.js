const { marked } = require('marked');

marked.setOptions({
  breaks: true,
  gfm: true
});

// Allowed HTML tags and attributes for sanitization
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'ins', 'sub', 'sup'];
const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'class'];
const DANGEROUS_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'base', 'link', 'meta'];
const TAG_PATTERN = new RegExp(`<(/)?([a-zA-Z][a-zA-Z0-9]*)(\\s+[^>]*)?>`, 'g');
const ATTR_PATTERN = new RegExp(`\\s(${ALLOWED_ATTR.join('|')})=["'][^"']*["']`, 'g');

/**
 * Check if URL is safe (no dangerous schemes)
 */
function isSafeUrl(url) {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  // Block dangerous URL schemes
  const dangerousSchemes = ['javascript', 'vbscript', 'data', 'file', 'blob'];
  for (const scheme of dangerousSchemes) {
    if (trimmed.startsWith(scheme + ':')) {
      return false;
    }
    // Also check encoded variants
    if (trimmed.startsWith(scheme.replace(/./g, c => `&#${c.charCodeAt(0)};`))) {
      return false;
    }
  }
  return true;
}

function sanitize(html) {
  // Remove dangerous tags completely
  let sanitized = html;
  for (const tag of DANGEROUS_TAGS) {
    const openPattern = new RegExp(`<${tag}[\\s>].*?<\\/${tag}>`, 'gi');
    const selfClosePattern = new RegExp(`<${tag}[\\s\\/]*>`, 'gi');
    sanitized = sanitized.replace(openPattern, '');
    sanitized = sanitized.replace(selfClosePattern, '');
  }

  // Strip disallowed tags
  sanitized = sanitized.replace(TAG_PATTERN, (match, slash, tag) => {
    if (ALLOWED_TAGS.includes(tag.toLowerCase())) {
      return match;
    }
    return '';
  });

  // Strip disallowed attributes from allowed tags
  sanitized = sanitized.replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z0-9_-]+=["'][^"']*["'])*)\s*(\/?)>/g, (match, tag, attrs, selfClose) => {
    if (!ALLOWED_TAGS.includes(tag.toLowerCase())) {
      return match; // Already filtered above
    }
    const kept = [];
    const attrRegex = /\s([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      if (ALLOWED_ATTR.includes(attrMatch[1].toLowerCase())) {
        // Validate URL attributes for safety
        if ((attrMatch[1] === 'href' || attrMatch[1] === 'src') && !isSafeUrl(attrMatch[2])) {
          continue; // Skip dangerous URLs
        }
        kept.push(` ${attrMatch[1]}="${attrMatch[2]}"`);
      }
    }
    return `<${tag}${kept.join('')}${selfClose}>`;
  });

  // Strip event handlers (on*) — matches onclick="...", onclick='...', onclick=value
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');

  // Strip javascript: URLs (additional patterns)
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*javascript:[^"'>]*["']?/gi, 'href="#"');
  sanitized = sanitized.replace(/src\s*=\s*["']?\s*(?:javascript|data|vbscript):[^"'>]*["']?/gi, 'src="#"');

  return sanitized;
}

function parseMarkdown(content) {
  if (!content) return '';
  const html = marked.parse(content);
  return sanitize(html);
}

module.exports = { parseMarkdown, sanitize, isSafeUrl };