'use client';

import { ResourceVersion } from '@/types';
import { Tag } from 'lucide-react';

interface VersionSelectorProps {
  versions: ResourceVersion[];
  currentVersion: string | null;
  onSelect: (version: string) => void;
}

export default function VersionSelector({ versions, currentVersion, onSelect }: VersionSelectorProps) {
  if (versions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tag className="w-4 h-4 text-[var(--text-muted)]" />
      <span className="text-sm text-[var(--text-secondary)]">版本:</span>
      {versions.map((v) => (
        <button
          key={v.version}
          onClick={() => onSelect(v.version)}
          className={`px-2.5 py-1 text-xs rounded-[var(--radius-sm)] transition-colors ${
            currentVersion === v.version
              ? 'bg-[var(--primary)] text-white font-medium'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
          }`}
        >
          {v.version}
        </button>
      ))}
    </div>
  );
}