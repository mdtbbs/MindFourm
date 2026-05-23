'use client';

import Link from 'next/link';
import { Resource } from '@/types';
import { Download, ExternalLink, FileText } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

function CategoryIcon({ icon }: { icon: string | null }) {
  const IconComponent = icon && ((LucideIcons as unknown) as Record<string, React.ComponentType<{ className?: string }>>)[icon];
  return IconComponent ? <IconComponent className="w-4 h-4" /> : <FileText className="w-4 h-4" />;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link
      href={`/resources/${resource.id}`}
      className="block bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)] p-4 hover:border-[var(--primary)]/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-[var(--bg-elevated)] rounded-[var(--radius-sm)] text-[var(--text-secondary)]">
          <CategoryIcon icon={resource.category_icon} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--text)] truncate">{resource.title}</h3>
          {resource.version && (
            <span className="inline-block mt-1 px-1.5 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)] text-[10px] rounded-[var(--radius-sm)] font-mono">
              {resource.version}
            </span>
          )}
        </div>
      </div>

      {resource.resource_type === 'external' && (
        <div className="flex items-center gap-1 mt-2 text-xs text-[var(--text-muted)]">
          <ExternalLink className="w-3 h-3" />
          外链资源
        </div>
      )}

      <div className="flex items-center justify-between mt-3 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-3">
          {resource.file_size > 0 && <span>{formatSize(resource.file_size)}</span>}
          <span className="flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />
            {resource.download_count}
          </span>
        </div>
        {resource.category_name && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-[var(--bg-elevated)] rounded-full">
            <CategoryIcon icon={resource.category_icon} />
            {resource.category_name}
          </span>
        )}
      </div>
    </Link>
  );
}