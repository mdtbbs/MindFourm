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
  'span', 'aside',
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
    a: ['href', 'title', 'target', 'rel', 'data-mention-user-id', 'data-rich-video-provider', 'data-rich-video-id', 'data-attachment-id'],
    img: ['src', 'alt', 'title', 'loading', 'decoding', 'data-custom-emoji-id'],
    code: ['class'],
    pre: ['class'],
    li: ['class', 'data-task-item'],
    input: ['type', 'checked', 'disabled'],
    th: ['colspan', 'rowspan', 'scope', 'data-align'],
    td: ['colspan', 'rowspan', 'data-align'],
    ol: ['start', 'type'],
    details: ['open'],
    span: ['data-color', 'data-highlight', 'data-font-size', 'data-font-family'],
    aside: ['data-quote-type', 'data-post-id', 'data-reply-id'],
    ul: ['data-task-list'],
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
    th: (tagName, attribs) => ({ tagName, attribs: {
      ...(attribs.scope === 'col' ? { scope: 'col' } : {}),
      ...(attribs['data-align'] && ['left', 'center', 'right'].includes(attribs['data-align']) ? { 'data-align': attribs['data-align'] } : {}),
      ...( /^\d{1,3}$/.test(attribs.colspan || '') ? { colspan: attribs.colspan } : {}),
      ...( /^\d{1,3}$/.test(attribs.rowspan || '') ? { rowspan: attribs.rowspan } : {}),
    } }),
    td: (tagName, attribs) => ({ tagName, attribs: {
      ...(attribs['data-align'] && ['left', 'center', 'right'].includes(attribs['data-align']) ? { 'data-align': attribs['data-align'] } : {}),
      ...( /^\d{1,3}$/.test(attribs.colspan || '') ? { colspan: attribs.colspan } : {}),
      ...( /^\d{1,3}$/.test(attribs.rowspan || '') ? { rowspan: attribs.rowspan } : {}),
    } }),
    ol: (tagName, attribs) => ({ tagName, attribs: {
      ...( /^\d{1,6}$/.test(attribs.start || '') ? { start: attribs.start } : {}),
      ...( ['1', 'a', 'A', 'i', 'I'].includes(attribs.type || '') ? { type: attribs.type } : {}),
    } }),
    span: (tagName, attribs) => {
      const safe: Record<string, string> = {};
      if (/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/.test(attribs['data-color'] || '')) safe['data-color'] = attribs['data-color'];
      if (['yellow', 'green', 'blue', 'pink', 'orange'].includes(attribs['data-highlight'] || '')) safe['data-highlight'] = attribs['data-highlight'];
      if (/^(12|14|16|18|20|24|28|32)px$/.test(attribs['data-font-size'] || '')) safe['data-font-size'] = attribs['data-font-size'];
      if (['default', 'serif-cn', 'sans-cn', 'kai', 'source-serif-cn', 'source-sans-cn', 'monospace'].includes(attribs['data-font-family'] || '')) safe['data-font-family'] = attribs['data-font-family'];
      return { tagName, attribs: safe };
    },
    aside: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs['data-quote-type'] === 'post' || attribs['data-quote-type'] === 'reply' ? { 'data-quote-type': attribs['data-quote-type'] } : {}),
        ...( /^\d+$/.test(attribs['data-post-id'] || '') ? { 'data-post-id': attribs['data-post-id'] } : {}),
        ...( /^\d+$/.test(attribs['data-reply-id'] || '') ? { 'data-reply-id': attribs['data-reply-id'] } : {}),
      },
    }),
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
