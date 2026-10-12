import { ForbiddenException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { HTML_DOCUMENT_MAX_LENGTH, isHtmlDocument, sanitizeHtmlDocument } from './html-document.util';
import { ROLES, RoleName } from './constants';

/**
 * The one sanitizer allowed to keep a *trusted* HTML fragment.
 *
 * Rich text normally drops arbitrary HTML: the reader is a React tree built from
 * structured JSON, and `markdown.util.ts` bounds the compatibility path to a few
 * structural tags. This module is the deliberate exception — a staff-only
 * `htmlBlock` node whose payload survives as HTML. Two rules keep it one
 * exception and not a general door:
 *
 *  1. Tag, attribute and CSS declaration whitelists are explicit and anchored.
 *     Anything not listed is dropped, not escaped into text (a fragment that
 *     lives inside a themed page should not render its own `<font>` markup).
 *  2. Values that can escape the document or the viewport — `position`,
 *     `url()`, `expression()`, `@import`, custom properties — are excluded by
 *     construction, so no CSS value can load a remote resource or overlay the
 *     page.
 *
 * Full documents / stylesheets instead use the shared sandbox policy in
 * `html-document.util.ts`; none of their CSS enters the host document.
 *
 * The frontend mirrors these tables in `frontend/src/lib/tiptap/trusted-html.ts`
 * and `tests/frontend/rich-content-html-block.spec.ts` fails when the two drift.
 */

/** Longest fragment accepted for one block. */
export const TRUSTED_HTML_MAX_LENGTH = HTML_DOCUMENT_MAX_LENGTH;
/** Blocks accepted per document. */
export const TRUSTED_HTML_MAX_BLOCKS = 5;

/** Tags a fragment may keep. No `script`, `style`, `iframe`, `form`, `svg`, `math`. */
export const TRUSTED_HTML_TAGS = [
  'a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'cite', 'code',
  'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img',
  'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small',
  'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'time', 'tr', 'u', 'ul', 'var',
];

const HEX = '#[0-9A-Fa-f]{3,8}';
const FUNCTIONAL_COLOR = '(?:rgba?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*(?:,\\s*(?:0|1|0?\\.\\d{1,3})\\s*)?\\)|hsla?\\(\\s*\\d{1,3}(?:deg)?\\s*,\\s*\\d{1,3}%\\s*,\\s*\\d{1,3}%\\s*(?:,\\s*(?:0|1|0?\\.\\d{1,3})\\s*)?\\))';
const NAMED_COLOR = '[a-zA-Z]{3,20}';
const COLOR = `(?:${HEX}|${FUNCTIONAL_COLOR}|${NAMED_COLOR}|transparent|currentColor)`;
const LENGTH = '(?:0|-?\\d{1,4}(?:\\.\\d{1,2})?(?:px|em|rem|%|pt|ch))';
const LENGTHS = `(?:0|(?:${LENGTH})(?:\\s+(?:0|${LENGTH})){0,3})`;
const SIDE = '(?:top|right|bottom|left)';
const BORDER_STYLE = '(?:none|hidden|solid|dashed|dotted|double)';
const FONT_STACK = '[A-Za-z0-9\\s,\'"_-]{1,120}';

/**
 * Declarations a fragment may keep. Every pattern is anchored, so a value only
 * survives when the *whole* declaration matches: `url(...)`, `expression(...)`,
 * `\`, `/*` and `;` can never appear inside one.
 */
const CSS_PROPERTIES: Record<string, RegExp[]> = {
  color: [new RegExp(`^${COLOR}$`, 'i')],
  'background-color': [new RegExp(`^${COLOR}$`, 'i')],
  background: [new RegExp(`^${COLOR}$`, 'i')],
  'background-image': [/^(?:repeating-)?(?:linear|radial)-gradient\([A-Za-z0-9#%.,\s()/-]{1,300}\)$/i],
  'border-color': [new RegExp(`^${COLOR}$`, 'i')],
  'border-style': [new RegExp(`^${BORDER_STYLE}$`)],
  'border-width': [new RegExp(`^${LENGTHS}$`)],
  'border-radius': [new RegExp(`^${LENGTHS}$`)],
  'border-top': [new RegExp(`^${LENGTH}(?:\\s+${BORDER_STYLE})?(?:\\s+${COLOR})?$`, 'i')],
  'border-bottom': [new RegExp(`^${LENGTH}(?:\\s+${BORDER_STYLE})?(?:\\s+${COLOR})?$`, 'i')],
  'border-left': [new RegExp(`^${LENGTH}(?:\\s+${BORDER_STYLE})?(?:\\s+${COLOR})?$`, 'i')],
  'border-right': [new RegExp(`^${LENGTH}(?:\\s+${BORDER_STYLE})?(?:\\s+${COLOR})?$`, 'i')],
  'border-inline-start': [new RegExp(`^${LENGTH}(?:\\s+${BORDER_STYLE})?(?:\\s+${COLOR})?$`, 'i')],
  'border-inline-end': [new RegExp(`^${LENGTH}(?:\\s+${BORDER_STYLE})?(?:\\s+${COLOR})?$`, 'i')],
  'border-collapse': [/^(?:collapse|separate)$/],
  'box-shadow': [/^(?:none|(?:inset\s+)?(?:0|-?\d{1,4}px)\s+(?:(?:0|-?\d{1,4}px)\s+){1,3}(?:#[0-9A-Fa-f]{3,8}|rgba?\([^)]{1,40}\))?)$/],
  display: [/^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|table|table-cell|table-row|list-item)$/],
  flex: [/^(?:none|auto|initial|[0-9]\d{0,3}(?:\.\d{1,2})?(?:\s+[0-9]\d{0,3}(?:\.\d{1,2})?)?(?:\s+(?:auto|[0-9]\d{0,3}(?:\.\d{1,2})?(?:px|em|rem|%)?))?)$/],
  'flex-direction': [/^(?:row|row-reverse|column|column-reverse)$/],
  'flex-grow': [/^\d{1,3}(?:\.\d{1,2})?$/],
  'flex-shrink': [/^\d{1,3}(?:\.\d{1,2})?$/],
  'flex-basis': [new RegExp(`^(?:${LENGTH}|auto|content)$`)],
  order: [/^-?\d{1,3}$/],
  border: [new RegExp(`^${LENGTH}(?:\\s+${BORDER_STYLE})?(?:\\s+${COLOR})?$`, 'i')],
  'flex-wrap': [/^(?:nowrap|wrap|wrap-reverse)$/],
  'align-items': [/^(?:flex-start|flex-end|center|baseline|stretch|start|end)$/],
  'align-content': [/^(?:flex-start|flex-end|center|space-between|space-around|space-evenly|stretch|start|end)$/],
  'justify-content': [/^(?:flex-start|flex-end|center|space-between|space-around|space-evenly|start|end)$/],
  gap: [new RegExp(`^${LENGTH}$`)],
  'row-gap': [new RegExp(`^${LENGTH}$`)],
  'column-gap': [new RegExp(`^${LENGTH}$`)],
  'grid-template-columns': [/^(?:repeat\(\s*\d{1,2}\s*,\s*)?(?:minmax\(\s*\d{1,4}px\s*,\s*\d{1,4}px\s*\)|[A-Za-z0-9.%\s]+)(?:\s*\))?(?:\s+(?:repeat\(\s*\d{1,2}\s*,\s*)?(?:minmax\(\s*\d{1,4}px\s*,\s*\d{1,4}px\s*\)|[A-Za-z0-9.%\s]+)(?:\s*\))?){0,3}$/],
  'font-size': [/^\d{1,3}(?:\.\d{1,2})?(?:px|em|rem|%|pt)$/],
  'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/],
  'font-style': [/^(?:normal|italic|oblique)$/],
  'font-family': [new RegExp(`^${FONT_STACK}$`)],
  'font-variant': [/^small-caps$/],
  'line-height': [/^\d{1,2}(?:\.\d{1,2})?(?:px|em|rem|%)?$/],
  'letter-spacing': [new RegExp(`^${LENGTH}$`)],
  'word-break': [/^(?:normal|break-all|keep-all|break-word)$/],
  'text-align': [/^(?:left|right|center|justify|start|end)$/],
  'text-decoration': [/^(?:none|underline|overline|line-through|underline\s+line-through|line-through\s+underline)$/],
  'text-decoration-line': [/^(?:none|underline|overline|line-through)$/],
  'text-decoration-style': [/^(?:solid|double|dotted|dashed|wavy)$/],
  'text-transform': [/^(?:none|capitalize|uppercase|lowercase)$/],
  'text-indent': [new RegExp(`^${LENGTH}$`)],
  'text-shadow': [/^(?:none|-?\d{1,3}px\s+-?\d{1,3}px\s+\d{1,3}px(?:\s+(?:#[0-9A-Fa-f]{3,8}|rgba?\([^)]{1,40}\)))?)$/],
  'white-space': [/^(?:normal|pre|pre-wrap|pre-line|break-spaces)$/],
  'overflow-wrap': [/^(?:normal|break-word|anywhere)$/],
  margin: [new RegExp(`^${LENGTHS}$`)],
  padding: [new RegExp(`^${LENGTHS}$`)],
  'margin-top': [new RegExp(`^${LENGTH}$`)],
  'margin-right': [new RegExp(`^${LENGTH}$`)],
  'margin-bottom': [new RegExp(`^${LENGTH}$`)],
  'margin-left': [new RegExp(`^${LENGTH}$`)],
  'padding-top': [new RegExp(`^${LENGTH}$`)],
  'padding-right': [new RegExp(`^${LENGTH}$`)],
  'padding-bottom': [new RegExp(`^${LENGTH}$`)],
  'padding-left': [new RegExp(`^${LENGTH}$`)],
  width: [new RegExp(`^(?:${LENGTH}|auto|fit-content|max-content|min-content)$`)],
  height: [new RegExp(`^(?:${LENGTH}|auto|fit-content|max-content|min-content)$`)],
  'min-width': [new RegExp(`^(?:${LENGTH}|auto|fit-content|max-content|min-content)$`)],
  'min-height': [new RegExp(`^(?:${LENGTH}|auto|fit-content|max-content|min-content)$`)],
  'max-width': [new RegExp(`^(?:${LENGTH}|none|fit-content|max-content|min-content)$`)],
  'max-height': [new RegExp(`^(?:${LENGTH}|none|fit-content|max-content|min-content)$`)],
  'box-sizing': [/^(?:content-box|border-box)$/],
  float: [/^(?:left|right|none|inline-start|inline-end)$/],
  clear: [/^(?:none|left|right|both)$/],
  opacity: [/^(?:0|1|0?\.\d{1,3})$/],
  'overflow-x': [/^(?:visible|hidden|auto|scroll)$/],
  'overflow-y': [/^(?:visible|hidden|auto|scroll)$/],
  transform: [/^(?:translate|translateX|translateY|scale|scaleX|scaleY|rotate|skewX|skewY)\(-?\d{1,3}(?:\.\d{1,3})?(?:px|%|deg)?\)(?:\s+(?:translate|translateX|translateY|scale|scaleX|scaleY|rotate|skewX|skewY)\(-?\d{1,3}(?:\.\d{1,3})?(?:px|%|deg)?\)){0,3}$/],
};

/** Per-tag attribute allowlist; `*` applies to every allowed tag. */
const TAG_ATTRIBUTES: Record<string, string[]> = {
  '*': ['style', 'title', 'dir'],
  a: ['href', 'target', 'rel', 'title', 'style'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'style'],
  ol: ['start', 'type', 'reversed'],
  li: ['value'],
  td: ['colspan', 'rowspan', 'scope', 'align'],
  th: ['colspan', 'rowspan', 'scope', 'align'],
  col: ['span'],
  colgroup: ['span'],
  details: ['open'],
  time: ['datetime'],
  q: ['cite'],
  blockquote: ['cite'],
};

const ALIGNMENTS = ['left', 'center', 'right', 'justify'];
const TABLE_SPANS = /^\d{1,3}$/;
const IMG_DIMENSION = /^\d{1,4}$/;

/**
 * `sanitize-html`'s `allowedStyles` only sees the value, so the negative
 * conditions that are not expressible as one anchored pattern are repeated here.
 */
function isUnsafeValue(value: string): boolean {
  return /(?:url\s*\(|expression\s*\(|javascript:|@import|\\|\/\*|<\/?)/i.test(value);
}

function styleIsAllowed(property: string, value: string): boolean {
  const patterns = CSS_PROPERTIES[property];
  if (!patterns || isUnsafeValue(value)) return false;
  return patterns.some((pattern) => pattern.test(value.trim()));
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: TRUSTED_HTML_TAGS,
  allowedAttributes: TAG_ATTRIBUTES,
  allowedStyles: {
    // `allowedStyles` cannot express "the whole value must match"; the anchored
    // patterns below are re-checked in `transformTags` via `styleIsAllowed`.
    '*': Object.fromEntries(Object.keys(CSS_PROPERTIES).map((property) => [property, [new RegExp(`^(?!(?:.*(?:url\\s*\\(|expression\\s*\\(|javascript:|@import|\\\\|\\/\\*))).*$`, 'i')]])),
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Their text content is markup, not prose, so it must not leak into the page.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template', 'title'],
  transformTags: {
    '*': (tagName, attribs) => {
      const kept: Record<string, string> = {};
      const allowed = new Set([...(TAG_ATTRIBUTES['*'] || []), ...(TAG_ATTRIBUTES[tagName] || [])]);
      for (const [name, value] of Object.entries(attribs)) {
        const key = name.toLowerCase();
        if (!allowed.has(key)) continue;
        if (typeof value !== 'string') continue;
        if (key === 'style') {
          const declarations = value.split(';').map((declaration) => declaration.trim()).filter(Boolean);
          const safe = declarations.filter((declaration) => {
            const separator = declaration.indexOf(':');
            if (separator < 0) return false;
            const property = declaration.slice(0, separator).trim().toLowerCase();
            const propertyValue = declaration.slice(separator + 1).trim();
            // `!important` would override the site theme from inside user content.
            if (/!\s*important$/i.test(propertyValue)) return false;
            return styleIsAllowed(property, propertyValue);
          });
          if (safe.length) kept.style = safe.join('; ');
          continue;
        }
        if (key === 'colspan' || key === 'rowspan' || key === 'span') {
          if (TABLE_SPANS.test(value.trim())) kept[key] = value.trim();
          continue;
        }
        if (key === 'width' || key === 'height') {
          if (IMG_DIMENSION.test(value.trim())) kept[key] = value.trim();
          continue;
        }
        if (key === 'align') {
          if (ALIGNMENTS.includes(value.trim().toLowerCase())) kept[key] = value.trim().toLowerCase();
          continue;
        }
        if (key === 'dir') {
          if (['ltr', 'rtl', 'auto'].includes(value.trim().toLowerCase())) kept[key] = value.trim().toLowerCase();
          continue;
        }
        if (key === 'href' || key === 'src') {
          kept[key] = value;
          continue;
        }
        kept[key] = value;
      }
      if (tagName === 'img') {
        kept.loading = 'lazy';
        kept.decoding = 'async';
      }
      if (tagName === 'a') {
        kept.rel = 'nofollow noopener noreferrer';
        const href = kept.href || '';
        if (href && !href.startsWith('/') && !href.startsWith('#')) kept.target = '_blank';
      }
      return { tagName, attribs: kept };
    },
  },
};

/**
 * Bounds a staff HTML fragment to the tables above. Idempotent: the output of
 * this function is a fixed point, which is what lets `content_html` re-sanitize
 * a stored block without rewriting it.
 */
export function sanitizeTrustedHtml(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  if (isHtmlDocument(html)) return sanitizeHtmlDocument(html);
  const bounded = html.length > TRUSTED_HTML_MAX_LENGTH ? html.slice(0, TRUSTED_HTML_MAX_LENGTH) : html;
  return sanitizeHtml(bounded, SANITIZE_OPTIONS).trim();
}

/**
 * Plain text of a fragment, for the Markdown / `content_text` projections.
 *
 * Block boundaries become spaces before the tags are stripped: joining a heading
 * straight onto its paragraph would produce a run-on word that then feeds search
 * and every excerpt.
 */
export function trustedHtmlToText(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  const separated = html.replace(/<\/?(?:p|div|h[1-6]|li|tr|td|th|section|article|header|footer|figure|figcaption|blockquote|ul|ol|table|dl|dt|dd|details|summary|pre|br|hr)\b[^>]*>/gi, ' ');
  const text = sanitizeHtml(separated, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  if (text) return text;
  // A block can legitimately be an image and nothing else. Its alt text is the only
  // prose it has, and without it the document would look empty to the API (which
  // rejects a post with no text) and to search.
  const alts = [...html.matchAll(/<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map((match) => (match[1] ?? match[2] ?? '').trim())
    .filter(Boolean);
  return alts.join(' ').trim();
}

/** Whether a role may submit `htmlBlock` nodes. Moderator and above. */
export function roleAllowsHtmlBlocks(role: string | null | undefined): boolean {
  return (ROLES[role as RoleName] ?? 0) >= ROLES.moderator;
}

/**
 * Whether a document carries any `htmlBlock` node.
 *
 * Deliberately a shallow walk over raw JSON: this runs on *stored* documents
 * (backfills, re-serialization) as well as incoming ones, and needs to answer
 * "is there anything privileged here" without a full schema validation.
 */
export function documentContainsHtmlBlocks(document: unknown): boolean {
  let found = false;
  let visited = 0;
  const visit = (value: unknown, depth: number) => {
    if (found || !value || typeof value !== 'object' || depth > 32 || ++visited > 20_000) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'htmlBlock') { found = true; return; }
    visit(node.content, depth + 1);
  };
  visit(document, 0);
  return found;
}

/**
 * Gate for the write paths. Sanitizing keeps an `htmlBlock` harmless, but only
 * the management team gets to place one in the first place — so authorship, not
 * content, is what this checks. Called with the *author's* role on create and
 * update; every other call site (re-serialization, backfill, preview draft)
 * keeps the author's document intact and must not re-check.
 */
export function assertHtmlBlockPermission(document: unknown, role: string | null | undefined): void {
  if (roleAllowsHtmlBlocks(role)) return;
  if (documentContainsHtmlBlocks(document)) {
    throw new ForbiddenException({
      code: 'HTML_BLOCK_FORBIDDEN',
      message: 'HTML 区块仅限管理团队使用',
      details: [{ code: 'HTML_BLOCK_FORBIDDEN', message: 'HTML 区块仅限管理团队使用' }],
    });
  }
}
