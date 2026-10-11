/**
 * Renders a staff-authored HTML fragment as a React tree.
 *
 * The stored fragment was already bounded by `sanitizeTrustedHtml` in
 * `src/common/utils/trusted-html.util.ts`, so this is the second of two
 * independent passes rather than the only one. It has to be a real pass all the
 * same: the stored string is rendered on every read, and the browser must never
 * be handed markup to interpret. There is no `innerHTML` anywhere in this
 * pipeline, server or client — the fragment becomes React elements here, and
 * anything this module does not recognise is dropped.
 *
 * Two properties it deliberately keeps from the server side:
 *
 *  - It is isomorphic. The renderer runs during SSR too, so the parser is pure
 *    string work with no DOM API and no dependency.
 *  - Its tables are checked against the server's by
 *    `tests/frontend/rich-content-html-block.spec.ts`, because a fragment that
 *    sanitizes on write but disappears on read (or the reverse) is a bug the
 *    user would see as "my HTML works, then it doesn't".
 */

/** Mirrors `TRUSTED_HTML_TAGS`; a spec fails when the two lists drift. */
export const TRUSTED_HTML_TAGS = [
  'a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'cite', 'code',
  'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img',
  'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small',
  'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'time', 'tr', 'u', 'ul', 'var',
];

/** Mirrors the server's property set; the values are re-checked below. */
export const TRUSTED_CSS_PROPERTIES = [
  'color', 'background-color', 'background', 'background-image', 'border-color',
  'border-style', 'border-width', 'border-radius', 'border-top', 'border-bottom',
  'border-left', 'border-right', 'border-inline-start', 'border-inline-end',
  'border-collapse', 'box-shadow', 'display', 'flex', 'flex-direction', 'flex-wrap',
  'flex-grow', 'flex-shrink', 'flex-basis', 'order', 'border', 'align-items',
  'align-content', 'justify-content', 'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'font-size', 'font-weight', 'font-style', 'font-family',
  'font-variant', 'line-height', 'letter-spacing', 'word-break', 'text-align',
  'text-decoration', 'text-decoration-line', 'text-decoration-style', 'text-transform',
  'text-indent', 'text-shadow', 'white-space', 'overflow-wrap', 'margin', 'padding',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top',
  'padding-right', 'padding-bottom', 'padding-left', 'width', 'height', 'min-width',
  'min-height', 'max-width', 'max-height', 'box-sizing', 'float', 'clear', 'opacity',
  'overflow-x', 'overflow-y', 'transform',
];

/**
 * Values that must hold an enum rather than free text. Everything else on the
 * list above only has to clear `isUnsafeValue` — a longer tail of length/colour
 * patterns would be a second place to keep in sync for no safety gain, since the
 * server already bounded what was stored.
 */
const STRUCTURAL_VALUES: Record<string, RegExp> = {
  display: /^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|table|table-cell|table-row|list-item)$/,
  'flex-direction': /^(?:row|row-reverse|column|column-reverse)$/,
  'flex-wrap': /^(?:nowrap|wrap|wrap-reverse)$/,
  'align-items': /^(?:flex-start|flex-end|center|baseline|stretch|start|end)$/,
  'align-content': /^(?:flex-start|flex-end|center|space-between|space-around|space-evenly|stretch|start|end)$/,
  'justify-content': /^(?:flex-start|flex-end|center|space-between|space-around|space-evenly|start|end)$/,
  'text-align': /^(?:left|right|center|justify|start|end)$/,
  'box-sizing': /^(?:content-box|border-box)$/,
  float: /^(?:left|right|none|inline-start|inline-end)$/,
  clear: /^(?:none|left|right|both)$/,
  'border-collapse': /^(?:collapse|separate)$/,
  'white-space': /^(?:normal|pre|pre-wrap|pre-line|break-spaces)$/,
  'word-break': /^(?:normal|break-all|keep-all|break-word)$/,
  'overflow-x': /^(?:visible|hidden|auto|scroll)$/,
  'overflow-y': /^(?:visible|hidden|auto|scroll)$/,
  opacity: /^(?:0|1|0?\.\d{1,3})$/,
};

/** Attributes kept per tag; `*` applies to every tag. The server filters these first. */
const TAG_ATTRIBUTES: Record<string, string[]> = {
  '*': ['style', 'title', 'dir'],
  a: ['href'],
  img: ['src', 'alt', 'width', 'height'],
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

const VOID_TAGS = new Set(['br', 'hr', 'img', 'col', 'input', 'wbr']);
/** Their content is markup, not prose — dropping the tag must drop the text too. */
const NON_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template', 'title']);
const VOID_UNSAFE = /(?:url\s*\(|expression\s*\(|javascript:|@import|\\|\/\*|<\/?)/i;
const MAX_DEPTH = 48;
const MAX_NODES = 6000;

export type TrustedHtmlNode =
  | { type: 'text'; text: string }
  | { type: 'element'; tag: string; attributes: Record<string, string>; children: TrustedHtmlNode[] };

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9',
  reg: '\u00ae', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013',
  laquo: '\u00ab', raquo: '\u00bb', middot: '\u00b7', times: '\u00d7',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]{1,31});/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Surrogates and out-of-range code points would corrupt the string.
      if (!Number.isFinite(code) || code < 9 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\ufffd';
      try { return String.fromCodePoint(code); } catch { return '\ufffd'; }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Splits a tag's attribute tail into name/value pairs, tolerant of quoting. */
function parseAttributes(source: string): Array<[string, string]> {
  const attributes: Array<[string, string]> = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attributes.push([match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')]);
  }
  return attributes;
}

function styleValue(declaration: string): { property: string; value: string } | null {
  const separator = declaration.indexOf(':');
  if (separator < 0) return null;
  const property = declaration.slice(0, separator).trim().toLowerCase();
  const raw = declaration.slice(separator + 1).trim();
  return property ? { property, value: raw } : null;
}

/**
 * Declarations kept from a `style` attribute.
 *
 * `!important` is refused rather than stripped: a fragment that outranks the
 * site theme is not a fragment this pipeline wants to render, and the server
 * dropped it on write anyway.
 */
function safeStyle(style: string): string {
  const kept: string[] = [];
  for (const declaration of style.split(';')) {
    const parsed = styleValue(declaration);
    if (!parsed) continue;
    const { property, value } = parsed;
    if (!TRUSTED_CSS_PROPERTIES.includes(property)) continue;
    if (VOID_UNSAFE.test(value) || /!\s*important$/i.test(value)) continue;
    const enumPattern = STRUCTURAL_VALUES[property];
    if (enumPattern && !enumPattern.test(value)) continue;
    // The declaration is kept verbatim, exactly as the server does: reformatting it
    // would make the two passes disagree and rewrite the attribute on every save.
    kept.push(declaration.trim().replace(/;+$/, ''));
  }
  return kept.join('; ');
}

/** Kept declarations as property/value pairs, for the reader's `style` prop. */
export function keptStyleDeclarations(style: string): Array<[string, string]> {
  return style.split(';').map((declaration) => styleValue(declaration)).filter(Boolean)
    .map((parsed) => [parsed!.property, parsed!.value] as [string, string]);
}

function safeHtmlAttributes(tag: string, attributes: Array<[string, string]>): Record<string, string> {
  const allowed = new Set([...(TAG_ATTRIBUTES['*'] || []), ...(TAG_ATTRIBUTES[tag] || [])]);
  const kept: Record<string, string> = {};
  for (const [name, value] of attributes) {
    if (!allowed.has(name)) continue;
    if (name === 'style') {
      const serialized = safeStyle(value);
      if (serialized) kept.style = serialized;
      continue;
    }
    if (name === 'dir') {
      if (['ltr', 'rtl', 'auto'].includes(value.toLowerCase())) kept.dir = value.toLowerCase();
      continue;
    }
    if (['href', 'src'].includes(name)) {
      // Re-checked at render time by `safeUrl`; keeping it here would only move
      // the check, and both are cheap.
      kept[name] = value;
      continue;
    }
    kept[name] = value;
  }
  return kept;
}

/**
 * Parses a sanitized fragment into a node tree.
 *
 * Unrecognised tags are dropped but their children are kept, matching the
 * server's `disallowedTagsMode: 'discard'`. Unmatched closing tags are ignored
 * instead of unwinding the stack, so malformed input cannot escape its element.
 */
export function parseTrustedHtml(html: string): TrustedHtmlNode[] {
  if (typeof html !== 'string' || !html) return [];
  const root: TrustedHtmlNode = { type: 'element', tag: '#root', attributes: {}, children: [] };
  const stack: Array<{ tag: string; node: Extract<TrustedHtmlNode, { type: 'element' }> }> = [];
  const skip: string[] = [];
  let nodes = 0;
  let cursor = 0;

  const current = () => (stack.length ? stack[stack.length - 1].node : root);
  const append = (node: TrustedHtmlNode) => {
    if (nodes++ > MAX_NODES) return;
    current().children.push(node);
  };
  const appendText = (raw: string) => {
    if (skip.length || !raw) return;
    const text = decodeEntities(raw);
    if (text) append({ type: 'text', text });
  };

  while (cursor < html.length) {
    const next = html.indexOf('<', cursor);
    if (next < 0) { appendText(html.slice(cursor)); break; }
    if (next > cursor) appendText(html.slice(cursor, next));
    if (html.startsWith('<!--', next)) {
      const end = html.indexOf('-->', next + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', next) || html.startsWith('<?', next)) {
      const end = html.indexOf('>', next);
      cursor = end < 0 ? html.length : end + 1;
      continue;
    }
    const close = html.indexOf('>', next);
    if (close < 0) { appendText(html.slice(next)); break; }
    const raw = html.slice(next + 1, close);
    cursor = close + 1;

    const closing = raw.startsWith('/');
    const nameMatch = /^\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
    if (!nameMatch) continue;
    const tag = nameMatch[1].toLowerCase();
    const selfClosing = raw.endsWith('/') || VOID_TAGS.has(tag);

    if (closing) {
      if (NON_TEXT_TAGS.has(tag) && skip.length && skip[skip.length - 1] === tag) { skip.pop(); continue; }
      if (skip.length) continue;
      // Unwind to the nearest matching open element; anything deeper was never
      // opened, and anything shallower is not this tag's business.
      const depth = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (depth >= 0) stack.length = depth;
      continue;
    }

    if (NON_TEXT_TAGS.has(tag)) {
      if (!selfClosing) skip.push(tag);
      continue;
    }
    if (!TRUSTED_HTML_TAGS.includes(tag)) continue;
    if (stack.length >= MAX_DEPTH) continue;

    if (selfClosing) {
      append({ type: 'element', tag, attributes: safeHtmlAttributes(tag, parseAttributes(raw.slice(nameMatch[0].length))), children: [] });
      continue;
    }
    const node: Extract<TrustedHtmlNode, { type: 'element' }> = {
      type: 'element', tag, attributes: safeHtmlAttributes(tag, parseAttributes(raw.slice(nameMatch[0].length))), children: [],
    };
    append(node);
    stack.push({ tag, node });
  }

  while (stack.length > 1) stack.pop();
  return root.children;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeNode(node: TrustedHtmlNode): string {
  if (node.type === 'text') return escapeText(node.text);
  const attributes = Object.entries(node.attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
  if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attributes} />`;
  return `<${node.tag}${attributes}>${node.children.map(serializeNode).join('')}</${node.tag}>`;
}

/**
 * Client-side pass over a fragment: parse through the allowlist, then rebuild.
 *
 * This is the same shape as the server's `sanitizeTrustedHtml` — the editor uses
 * it so its preview can never show more than what will be stored, and so a block
 * round-trips unchanged instead of being re-written on save. It is *not* the
 * security boundary: the server re-runs its own pass on write, which is what
 * protects readers.
 */
export function sanitizeTrustedHtmlClient(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  return parseTrustedHtml(html).map(serializeNode).join('').trim();
}

/**
 * Plain text of a fragment.
 *
 * The API stores an equivalent projection on the node (`attrs.text`); deriving it
 * the same way here keeps the editor's Markdown projection comparable to what the
 * server would store for the same document.
 */
export function trustedHtmlText(html: string): string {
  const collect = (nodes: TrustedHtmlNode[]): string => nodes
    .map((node) => (node.type === 'text' ? node.text : collect(node.children)))
    .join(' ');
  const text = collect(parseTrustedHtml(html)).replace(/\s+/g, ' ').trim();
  if (text) return text;
  // Mirrors the server: an image-only block projects its alt text, so the two
  // Markdown projections agree and the document is not considered empty.
  const collectAlts = (nodes: TrustedHtmlNode[]): string[] => nodes.flatMap((node) => {
    if (node.type === 'text') return [];
    return [...(node.tag === 'img' && node.attributes.alt ? [node.attributes.alt] : []), ...collectAlts(node.children)];
  });
  return collectAlts(parseTrustedHtml(html)).join(' ').trim();
}

/** React's `style` prop wants camelCase keys. */
export function styleObject(style: string | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  if (!style) return output;
  for (const [property, value] of keptStyleDeclarations(style)) {
    output[property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value;
  }
  return output;
}
