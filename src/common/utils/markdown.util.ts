import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr', 'del', 'ins', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'details', 'summary',
  // GFM task lists render as disabled checkboxes.
  'input',
];

/**
 * `marked` emits `class` on fenced code blocks (`language-*`) and on GFM task
 * list items, so `class` is allowed on the elements that carry it rather than
 * globally.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    // `target`/`rel` are injected by transformTags below, and attribute
    // filtering runs afterwards — so they have to be allowed here too.
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'decoding'],
    code: ['class'],
    pre: ['class'],
    li: ['class'],
    input: ['type', 'checked', 'disabled'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    ol: ['start'],
    details: ['open'],
  },
  // Blocks `javascript:`, `data:` and encoded variants such as `&#106;avascript:`
  // — entity decoding happens before the scheme check.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  // `script`/`style` are dropped along with their text content (sanitize-html
  // treats them as non-text tags); everything else keeps its text.
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'nofollow noopener noreferrer',
      },
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
    }),
    input: (tagName, attribs) => ({
      tagName,
      // Only the task-list checkbox shape survives; anything else becomes inert.
      attribs: attribs.type === 'checkbox'
        ? { type: 'checkbox', disabled: 'disabled', ...(attribs.checked !== undefined ? { checked: 'checked' } : {}) }
        : { type: 'hidden' },
    }),
  },
};

/**
 * Parse markdown to HTML and sanitize
 */
export function parseMarkdown(content: string): string {
  const html = marked.parse(content) as string;
  return sanitize(html);
}

/**
 * Strip every tag, attribute and URL scheme not on the allowlist above.
 *
 * `marked` passes raw HTML through untouched, so this is the only thing standing
 * between user input and the stored `content_html`.
 */
export function sanitize(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
