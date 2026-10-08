import { createElement, type ReactNode } from 'react';
import { richContentLowlight } from '@/lib/tiptap/syntax-highlight';

type HighlightNode = { type: string; value?: string; tagName?: string; properties?: { className?: string[] }; children?: HighlightNode[] };
function renderToken(node: HighlightNode, key: number): ReactNode {
  if (node.type === 'text') return node.value;
  // lowlight produces a span/text AST, never executable HTML.
  return createElement('span', { key, className: node.properties?.className?.join(' ') }, node.children?.map(renderToken));
}
export function RichCodeBlock({ text, language }: { text: string; language?: string | null }) {
  const tree = language && richContentLowlight.registered(language)
    ? richContentLowlight.highlight(language, text)
    : richContentLowlight.highlightAuto(text);
  return <pre><code className={language ? `language-${language}` : undefined}>{tree.children.map((node, key) => renderToken(node as HighlightNode, key))}</code></pre>;
}
