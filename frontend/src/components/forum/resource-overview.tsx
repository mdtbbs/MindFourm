'use client';

import { Resource } from '@/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { FileText } from 'lucide-react';

interface ResourceOverviewProps {
  resource: Resource;
}

export default function ResourceOverview({ resource }: ResourceOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Description */}
      {resource.description && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
          <h2 className="text-xl font-bold text-[var(--text)] mb-4">简介</h2>
          <MarkdownRenderer content={resource.description} className="text-[var(--text-secondary)] leading-relaxed" />
        </div>
      )}

      {/* Content */}
      {resource.content && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
          <h2 className="text-xl font-bold text-[var(--text)] mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            详细介绍
          </h2>
          <div className="prose prose-[var(--text)] max-w-none">
            <MarkdownRenderer content={resource.content} />
          </div>
        </div>
      )}
    </div>
  );
}
