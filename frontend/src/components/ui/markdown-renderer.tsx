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

  // Pre-process content to highlight @mentions
  const processedContent = content.replace(
    /@([一-龥a-zA-Z0-9_]+)/g,
    '[@$1](/users/search?q=$1)'
  );

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
