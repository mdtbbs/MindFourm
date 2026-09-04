'use client';

import { ResourceVersion } from '@/types';
import { Tag } from 'lucide-react';

interface VersionSelectorProps {
  versions: ResourceVersion[];
  baseVersion: string | null;
  selectedVersionId: number | null;
  onSelect: (versionId: number | null) => void;
}

export default function VersionSelector({
  versions,
  baseVersion,
  selectedVersionId,
  onSelect,
}: VersionSelectorProps) {
  if (versions.length === 0 && !baseVersion) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tag className="w-4 h-4 text-[var(--text-muted)]" />
      <span className="text-sm text-[var(--text-secondary)]">版本:</span>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`px-2.5 py-1 text-xs rounded-[var(--radius-sm)] transition-colors ${
          selectedVersionId === null
            ? 'bg-[var(--primary)] text-white font-medium'
            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
        }`}
      >
        {baseVersion || '主文件'}
      </button>
      {versions.map((version) => (
        <button
          type="button"
          key={version.id}
          onClick={() => onSelect(version.id)}
          className={`px-2.5 py-1 text-xs rounded-[var(--radius-sm)] transition-colors ${
            selectedVersionId === version.id
              ? 'bg-[var(--primary)] text-white font-medium'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
          }`}
        >
          {version.version}
        </button>
      ))}
    </div>
  );
}
