'use client';

import { createElement, Fragment, lazy, Suspense } from 'react';
import { parseTrustedHtml, styleObject, type TrustedHtmlNode } from '@/lib/tiptap/trusted-html';
import { safeUrl } from '@/lib/tiptap/presentation-url';
import { isHtmlDocument } from '../../../../src/common/utils/html-document-policy';

const RichHtmlDocument = lazy(() => import('./rich-html-document').then((module) => ({ default: module.RichHtmlDocument })));

/**
 * Renders one staff-authored HTML block.
 *
 * The fragment arrives as sanitized markup (`htmlBlock` in the Rich Content
 * schema) and leaves as React elements. Nothing here hands markup to the DOM to
 * interpret: `parseTrustedHtml` builds the tree, this maps it onto elements, and
 * the browser only ever sees the result. A reader with a devtools panel open
 * sees the same element tree a normal post would produce.
 *
 * Every tag is a fixed intrinsic name chosen from the parser's allowlist, so
 * there is no path from fragment content to a component or an event handler.
 */

/** Elements that never take children in HTML; React rejects a child argument for them. */
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'col']);

function elementAttributes(node: Extract<TrustedHtmlNode, { type: 'element' }>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  const style = styleObject(node.attributes.style);
  if (Object.keys(style).length) attributes.style = style;

  if (node.tag === 'a') {
    const href = safeUrl(node.attributes.href);
    if (href) {
      attributes.href = href;
      // Internal links stay in the tab; anything off-site opens away from the page.
      if (!href.startsWith('/') && !href.startsWith('#')) attributes.target = '_blank';
      attributes.rel = 'nofollow noopener noreferrer';
    }
  }
  if (node.tag === 'img') {
    const src = safeUrl(node.attributes.src, true);
    if (src) attributes.src = src;
    if (node.attributes.alt) attributes.alt = node.attributes.alt;
    const width = Number(node.attributes.width);
    const height = Number(node.attributes.height);
    // A fragment can only suggest a size; the shell's CSS still caps it to the column.
    if (Number.isSafeInteger(width) && width > 0 && width <= 4096) attributes.width = width;
    if (Number.isSafeInteger(height) && height > 0 && height <= 4096) attributes.height = height;
    attributes.loading = 'lazy';
    attributes.decoding = 'async';
  }
  if (node.tag === 'ol') {
    const start = Number(node.attributes.start);
    if (Number.isSafeInteger(start) && start > 1) attributes.start = start;
    if (['1', 'a', 'A', 'i', 'I'].includes(node.attributes.type)) attributes.type = node.attributes.type;
    if (node.attributes.reversed !== undefined) attributes.reversed = true;
  }
  if (node.tag === 'td' || node.tag === 'th') {
    const colspan = Number(node.attributes.colspan);
    const rowspan = Number(node.attributes.rowspan);
    if (Number.isSafeInteger(colspan) && colspan > 1 && colspan <= 100) attributes.colSpan = colspan;
    if (Number.isSafeInteger(rowspan) && rowspan > 1 && rowspan <= 100) attributes.rowSpan = rowspan;
  }
  if (node.tag === 'details' && node.attributes.open !== undefined) attributes.open = true;
  if (node.tag === 'time' && node.attributes.datetime) attributes.dateTime = node.attributes.datetime;
  if (node.tag === 'q' || node.tag === 'blockquote') {
    const cite = safeUrl(node.attributes.cite);
    if (cite) attributes.cite = cite;
  }
  if (node.tag === 'col' || node.tag === 'colgroup') {
    const span = Number(node.attributes.span);
    if (Number.isSafeInteger(span) && span > 1 && span <= 100) attributes.span = span;
  }
  // `dir` and `title` pass through as-is: neither can carry behaviour.
  if (node.attributes.dir) attributes.dir = node.attributes.dir;
  if (node.attributes.title) attributes.title = node.attributes.title;
  return attributes;
}

function renderNode(node: TrustedHtmlNode, key: number): React.ReactNode {
  if (node.type === 'text') return node.text;
  const children = node.children.map((child, index) => renderNode(child, index));
  const Tag = node.tag as keyof JSX.IntrinsicElements;
  if (VOID_ELEMENTS.has(node.tag)) {
    // An `img` without a usable src would render as a broken-image icon, which is
    // a worse answer than showing nothing.
    const attributes = elementAttributes(node);
    if (node.tag === 'img' && !attributes.src) return null;
    return createElement(node.tag, { key, ...attributes });
  }
  return createElement(Tag, { key, ...elementAttributes(node) }, ...children);
}

export function RichHtmlBlock({ html }: { html: string }) {
  if (isHtmlDocument(html)) return <Suspense fallback={<div role="status">正在加载 HTML 内容…</div>}><RichHtmlDocument html={html} /></Suspense>;
  const nodes = parseTrustedHtml(html);
  if (!nodes.length) return null;
  return (
    <div className="rich-html-block" data-testid="rich-html-block">
      {nodes.map((node, index) => (
        <Fragment key={index}>{renderNode(node, index)}</Fragment>
      ))}
    </div>
  );
}
