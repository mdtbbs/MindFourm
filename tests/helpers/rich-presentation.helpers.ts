import type { Locator } from '@playwright/test';

const selectors = [
  ':scope > p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', ':is(del,s)', 'u', 'sup', 'sub',
  'blockquote', 'ul ul', 'li > p', 'ul:not([data-task-list])', 'ol', 'li:not([data-task-item])', 'p code', 'pre', 'pre code',
  '.hljs-keyword', '.hljs-string', 'table', 'th', 'td', 'img:not(.rich-custom-emoji):not(.ProseMirror-separator)', 'hr', '[data-task-list]', '[data-task-item]', '[data-task-content]',
  '[data-type="spoiler"]', 'summary', '[data-spoiler-content]', '.rich-mention', '.rich-custom-emoji',
  '[data-color]', '[data-highlight]', '[data-font-size]', '[data-font-family]', '.rich-video-card', '.rich-video-stage', '.rich-attachment-card', '.rich-quote-card',
];
// `minWidth` / `width` belong here: the table layout used to differ between the
// editor (Tiptap's own `min-width: 50px`) and the reader (the stylesheet's
// `min-width: 30rem`), which this list could not see while it only checked
// typography. Overflow alone does not catch a table that is merely narrower.
const properties = ['fontSize', 'lineHeight', 'fontFamily', 'fontWeight', 'marginTop', 'marginBottom', 'paddingLeft', 'paddingRight', 'backgroundColor', 'color', 'borderLeftWidth', 'borderTopWidth', 'listStyleType', 'textAlign', 'overflowX', 'minWidth', 'width'];
// Only interaction differences are permitted; no typography/layout whitelist.
// Readonly checkboxes are disabled, editor NodeViews are contentEditable=false,
// video activation/quote availability and attachment actions differ by state.
export async function presentation(root: Locator) {
  const result: Record<string, string[]> = {};
  for (const selector of selectors) {
    result[selector] = await root.locator(selector).first().evaluate((element, keys) => {
      const style = getComputedStyle(element);
      return keys.map((key) => style[key as keyof CSSStyleDeclaration] as string);
    }, properties);
  }
  return result;
}

