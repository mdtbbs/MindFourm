'use client';

import { useState } from 'react';
import { Resource } from '@/types';
import { Download, ExternalLink, Calendar, User, FileText } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import * as LucideIcons from 'lucide-react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import VersionSelector from '@/components/ui/version-selector';

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

interface ResourceDetailProps {
  resource: Resource;
}

export default function ResourceDetail({ resource }: ResourceDetailProps) {
  const versions = resource.versions || [];
  const [selectedVersion, setSelectedVersion] = useState<string | null>(resource.version);

  return (
    <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)] p-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mb-4">{resource.title}</h1>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)] mb-4">
        <span className="flex items-center gap-1">
          <User className="w-4 h-4" />
          {resource.username}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {new Date(resource.created_at).toLocaleDateString('zh-CN')}
        </span>
        <span className="flex items-center gap-1">
          <Download className="w-4 h-4" />
          {resource.download_count} 次下载
        </span>
        {resource.file_size > 0 && <span>{formatSize(resource.file_size)}</span>}
        {resource.category_name && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-[var(--bg-elevated)] rounded-full text-xs">
            <CategoryIcon icon={resource.category_icon} />
            {resource.category_name}
          </span>
        )}
      </div>

      {/* Version selector */}
      {versions.length > 0 && (
        <div className="mb-4 p-3 bg-[var(--bg-elevated)] rounded-[var(--radius-sm)]">
          <VersionSelector
            versions={versions}
            currentVersion={selectedVersion}
            onSelect={setSelectedVersion}
          />
        </div>
      )}

      {/* Markdown content */}
      {resource.content_html ? (
        <div className="mb-6 p-4 bg-[var(--bg-elevated)] rounded-[var(--radius-card)]">
          <MarkdownRenderer content={resource.content_html} />
        </div>
      ) : resource.description ? (
        <div className="mb-6 p-4 bg-[var(--bg-elevated)] rounded-[var(--radius-card)] text-[var(--text-secondary)]">
          {resource.description}
        </div>
      ) : null}

      {/* Action buttons */}
      {resource.resource_type === 'file' ? (
        <a
          href={resourceApi.download(resource.id)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
        >
          <Download className="w-5 h-5" />
          下载 {resource.file_name}
        </a>
      ) : (
        <a
          href={resource.external_url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
        >
          <ExternalLink className="w-5 h-5" />
          访问外链
        </a>
      )}
    </div>
  );
}