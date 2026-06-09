const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

marked.setOptions({
  breaks: true,
  gfm: true,
});

const allowedSchemes = ['http', 'https', 'mailto'];

function sanitize(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'table',
      'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'ins', 'sub', 'sup',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      code: ['class'],
      pre: ['class'],
    },
    allowedSchemes,
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  });
}

function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, 'https://example.invalid');
    return allowedSchemes.includes(parsed.protocol.replace(':', ''));
  } catch {
    return false;
  }
}

function parseMarkdown(content) {
  if (!content) return '';
  const html = marked.parse(content);
  return sanitize(html);
}

module.exports = { parseMarkdown, sanitize, isSafeUrl };
