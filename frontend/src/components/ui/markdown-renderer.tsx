'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  fallback?: string;
}

export default function MarkdownRenderer({ content, className = '', fallback = '' }: MarkdownRendererProps) {
  if (!content) return <span className="text-surface-500">{fallback}</span>;

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
