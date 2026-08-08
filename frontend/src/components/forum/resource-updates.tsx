'use client';

import { Resource } from '@/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { GitBranch, Calendar } from 'lucide-react';

interface ResourceUpdatesProps {
  resource: Resource;
}

export default function ResourceUpdates({ resource }: ResourceUpdatesProps) {
  const versions = resource.versions || [];

  if (versions.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
        <p className="text-center text-[var(--text-muted)]">暂无更新记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
        <GitBranch className="w-5 h-5" />
        更新日志 ({versions.length})
      </h2>
      <div className="space-y-4">
        {versions.map((version, index) => (
          <div
            key={version.id}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-[var(--text)] mb-1">
                  {version.version}
                  {index === 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                      最新版本
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Calendar className="w-4 h-4" />
                  {new Date(version.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            {version.content && (
              <div className="prose prose-[var(--text)] max-w-none">
                <MarkdownRenderer content={version.content} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
