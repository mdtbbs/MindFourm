import { FONT_SIZES } from './presentation';

/**
 * Clipboard HTML → the subset the editor schema understands.
 *
 * Two things happen here: everything the schema cannot represent is dropped
 * (inline `style`, `class`, `id`, event handlers, embedded documents), and the
 * formatting it *can* represent is rewritten into the same `data-*` markers the
 * editor writes itself. Color, highlight and font size only survive on `span`s;
 * block alignment survives on paragraphs, headings and table cells.
 *
 * Alignment is also inherited: Word and web pages wrap content in styled `div`s
 * (`<div style="text-align:center"><p>…</p></div>`), so the value sinks to the
 * blocks inside — otherwise pasting a centered headline would silently drop it.
 */
const BLOCK_ALIGNMENTS = ['left', 'center', 'right', 'justify'];
/** Table cells carry the narrower set the API validates. */
const CELL_ALIGNMENTS = ['left', 'center', 'right'];
const TEXT_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const CELL_TAGS = new Set(['td', 'th']);
const DROPPED_ELEMENTS = 'script,style,iframe,object,embed,form,svg,math';
/** Structural elements that already carry a block of their own. */
const NESTED_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,div,section,article,ul,ol,li,table,blockquote,pre';
/** Elements that may legally gain a paragraph of their own (a styled `div` around bare text). */
const WRAPPER_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'CENTER', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ADDRESS', 'FIGURE']);
const HIGHLIGHT_COLORS = new Map([
  ['#fff2cc', 'yellow'], ['#d9ead3', 'green'], ['#cfe2f3', 'blue'],
  ['#f4cccc', 'pink'], ['#fce5cd', 'orange'],
]);

/** `data-align`, the legacy `align` attribute, `text-align`, or a `<center>` wrapper. */
function declaredAlignment(element: HTMLElement): string | null {
  const marker = (element.getAttribute('data-align') || '').toLowerCase();
  if (BLOCK_ALIGNMENTS.includes(marker)) return marker;
  const legacy = (element.getAttribute('align') || '').toLowerCase();
  if (BLOCK_ALIGNMENTS.includes(legacy)) return legacy;
  if (element.tagName === 'CENTER') return 'center';
  const style = (element.style?.textAlign || '').toLowerCase();
  return BLOCK_ALIGNMENTS.includes(style) ? style : null;
}

/** Walks up from `element` looking for the nearest declared alignment the target accepts. */
function inheritedAlignment(element: Element | null, alignments: Map<Element, string>, allow: (element: Element) => boolean): string | null {
  let node: Element | null = element;
  while (node) {
    const value = alignments.get(node);
    if (value && allow(node)) return value;
    node = node.parentElement;
  }
  return null;
}

/** Reads and strips the styling attributes, returning what the schema can keep. */
function takeStyle(element: HTMLElement) {
  const kept = { color: null as string | null, highlight: null as string | null, fontSize: null as string | null };
  const style = element.getAttribute('style');
  if (!style) return kept;
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim().toLowerCase();
    if (property === 'color') {
      const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value.toUpperCase() : null;
      const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
      kept.color = hex || (rgb && rgb.slice(1).every((part) => Number(part) <= 255) ? '#' + rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase() : null);
    }
    if (property === 'background-color') {
      kept.highlight = HIGHLIGHT_COLORS.get(value.replace(/\s/g, '')) || null;
    }
    if (property === 'font-size') {
      const match = /^(\d+(?:\.\d+)?)(px|pt)$/.exec(value);
      if (match) {
        const px = Math.round(Number(match[1]) * (match[2] === 'pt' ? 4 / 3 : 1));
        if (FONT_SIZES.includes(px)) kept.fontSize = px + 'px';
      }
    }
  }
  element.removeAttribute('style');
  return kept;
}

export function normalizePastedRichHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll(DROPPED_ELEMENTS).forEach((element) => element.remove());
  const alignments = new Map<Element, string>();
  for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || ['id', 'class'].includes(name)) { element.removeAttribute(attribute.name); continue; }
      // An HTML block is a staff-only node and the toolbar is its only entry point;
      // pasted markup must not be able to fabricate one (the server would refuse the
      // publish, turning a paste into a confusing failure).
      if (name === 'data-rich-html-block' || name === 'data-html') element.removeAttribute(attribute.name);
    }
    const alignment = declaredAlignment(element);
    if (alignment) alignments.set(element, alignment);
    const kept = takeStyle(element);
    if (element.tagName !== 'SPAN') continue;
    if (kept.color) element.setAttribute('data-color', kept.color);
    if (kept.highlight) element.setAttribute('data-highlight', kept.highlight);
    if (kept.fontSize) element.setAttribute('data-font-size', kept.fontSize);
  }
  // A cell's alignment styles everything inside it, so the blocks don't repeat
  // it — unless the cell cannot store that value itself (`justify`), in which
  // case the block is the only place left to keep it.
  const storesOnCell = (element: Element) => CELL_TAGS.has(element.tagName.toLowerCase())
    && CELL_ALIGNMENTS.includes(alignments.get(element) || '');
  for (const block of Array.from(document.body.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6'))) {
    const value = inheritedAlignment(block, alignments, (element) => !storesOnCell(element));
    if (value) block.setAttribute('data-align', value);
  }
  for (const cell of Array.from(document.body.querySelectorAll<HTMLElement>('td,th'))) {
    const value = inheritedAlignment(cell, alignments, () => true);
    if (value && CELL_ALIGNMENTS.includes(value)) cell.setAttribute('data-align', value);
  }
  for (const [element, alignment] of alignments) {
    if (!WRAPPER_TAGS.has(element.tagName)) continue;
    // Wrapper without a block of its own (a styled div around bare text):
    // give it the paragraph ProseMirror would create anyway, keeping the alignment.
    if (element.querySelector(NESTED_BLOCKS) || !element.textContent?.trim()) continue;
    const paragraph = element.ownerDocument.createElement('p');
    paragraph.setAttribute('data-align', inheritedAlignment(element, alignments, (candidate) => !storesOnCell(candidate)) || alignment);
    while (element.firstChild) paragraph.appendChild(element.firstChild);
    element.appendChild(paragraph);
  }
  return document.body.innerHTML;
}
