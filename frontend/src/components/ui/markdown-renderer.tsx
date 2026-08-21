import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeStoredContent, toContentExcerpt } from '@/lib/content/normalize-content';

interface MarkdownRendererProps {
  content: string;
  fallback?: string;
  className?: string;
  mode?: 'full' | 'excerpt';
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
      <Markdown remarkPlugins={[remarkGfm]}>{normalizedContent}</Markdown>
    </div>
  );
}
