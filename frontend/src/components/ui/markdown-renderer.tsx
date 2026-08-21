import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';
import { normalizeStoredContent, toContentExcerpt } from '@/lib/content/normalize-content';

interface MarkdownRendererProps {
  content: string;
  fallback?: string;
  className?: string;
  mode?: 'full' | 'excerpt';
}

function textFromChildren(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return textFromChildren((children as { props?: { children?: ReactNode } }).props?.children ?? '');
  }
  return '';
}

function headingId(children: ReactNode): string {
  return textFromChildren(children).trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s-]+/g, '-') || 'section';
}

export default function MarkdownRenderer({ content, fallback, className, mode = 'full' }: MarkdownRendererProps) {
  if (!content || content.trim().length === 0) {
    return fallback ? <p className="text-[var(--text-muted)]">{fallback}</p> : null;
  }

  if (mode === 'excerpt') {
    return <p className={className}>{toContentExcerpt(content) || fallback}</p>;
  }

  const normalizedContent = normalizeStoredContent(content);

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
        }}
      >
        {normalizedContent}
      </Markdown>
    </div>
  );
}
