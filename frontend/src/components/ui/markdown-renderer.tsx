import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  fallback?: string;
  className?: string;
}

export default function MarkdownRenderer({ content, fallback, className }: MarkdownRendererProps) {
  if (!content || content.trim().length === 0) {
    return fallback ? <p className="text-[var(--text-muted)]">{fallback}</p> : null;
  }

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}>
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}
