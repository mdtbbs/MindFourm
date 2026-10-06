import type { ReactNode } from 'react';

/** Highlights plain text safely without treating search terms or results as HTML. */
export default function SearchHighlight({ text, query }: { text: string; query: string }): ReactNode {
  const term = query.trim();
  if (!term || !text) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`(${escaped})`, 'giu');
  return text.split(matcher).map((part, index) => part.toLocaleLowerCase() === term.toLocaleLowerCase()
    ? <mark key={`${index}-${part}`} className="rounded bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30">{part}</mark>
    : part);
}
