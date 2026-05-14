const { marked } = require('marked');

marked.setOptions({
  breaks: true,
  gfm: true
});

// Allowed HTML tags and attributes for sanitization
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'ins', 'sub', 'sup'];
const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'class'];
const TAG_PATTERN = new RegExp(`<(/)?([a-zA-Z][a-zA-Z0-9]*)(\\s+[^>]*)?>`, 'g');
const ATTR_PATTERN = new RegExp(`\\s(${ALLOWED_ATTR.join('|')})=["'][^"']*["']`, 'g');

function sanitize(html) {
  // Strip disallowed tags
  let sanitized = html.replace(TAG_PATTERN, (match, slash, tag) => {
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
        kept.push(` ${attrMatch[1]}="${attrMatch[2]}"`);
      }
    }
    return `<${tag}${kept.join('')}${selfClose}>`;
  });

  // Strip event handlers (on*) — matches onclick="...", onclick='...', onclick=value
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  // Strip javascript: URLs
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*javascript:[^\s>"]*/gi, '');

  return sanitized;
}

function parseMarkdown(content) {
  if (!content) return '';
  const html = marked.parse(content);
  return sanitize(html);
}

module.exports = { parseMarkdown };