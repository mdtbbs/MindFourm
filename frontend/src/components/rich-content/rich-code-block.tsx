import { createElement, useEffect, useState, type ReactNode } from 'react';

type HighlightNode = { type: string; value?: string; tagName?: string; properties?: { className?: string[] }; children?: HighlightNode[] };
function renderToken(node: HighlightNode, key: number): ReactNode {
  if (node.type === 'text') return node.value;
  // lowlight produces a span/text AST, never executable HTML.
  return createElement('span', { key, className: node.properties?.className?.join(' ') }, node.children?.map(renderToken));
}

/**
 * Resolved once per browser session, off the initial load path.
 *
 * `lowlight/common` (highlight.js grammars + the parser) is ~166 KB of the
 * JavaScript behind every post and resource page. It is only ever needed to
 * colour a code block, which most pages do not contain, so it is imported on
 * first use instead of on mount. The regex literal below mirrors highlight.js's
 * own `noHighlightRe` (the pattern the package does not export), so `plaintext`
 * and `no-highlight` skip the grammar load entirely.
 */
const NO_HIGHLIGHT_RE = /^(no-?highlight)$/i;
type Highlighter = { registered: (name: string) => boolean; highlight: (name: string, value: string) => { children: HighlightNode[] }; highlightAuto: (value: string) => { children: HighlightNode[] } };
let highlighterPromise: Promise<Highlighter> | null = null;
function loadHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import('@/lib/tiptap/syntax-highlight').then((module) => module.richContentLowlight as unknown as Highlighter);
  return highlighterPromise;
}

export function RichCodeBlock({ text, language }: { text: string; language?: string | null }) {
  const skipped = Boolean(language && NO_HIGHLIGHT_RE.test(language));
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);

  useEffect(() => {
    if (skipped || highlighter) return;
    let active = true;
    void loadHighlighter().then((loaded) => { if (active) setHighlighter(loaded); }).catch(() => undefined);
    return () => { active = false; };
  }, [skipped, highlighter]);

  if (!highlighter) {
    // Plain, uncoloured code that matches the highlighted markup's own shape, so
    // swapping in the coloured version does not reflow the block.
    return <pre><code className={language && !skipped ? `language-${language}` : undefined}>{text}</code></pre>;
  }

  const tree = language && highlighter.registered(language)
    ? highlighter.highlight(language, text)
    : highlighter.highlightAuto(text);
  return <pre><code className={language ? `language-${language}` : undefined}>{tree.children.map((node, key) => renderToken(node, key))}</code></pre>;
}
