'use client';

/**
 * Renders the latest-version summary and file integrity hint for a V1
 * resource.
 *
 * The V1 data model deliberately does not carry per-file integrity
 * status for legacy releases — the UI reflects that with a "未验证"
 * hint rather than pretending the files have been checked. When the
 * backend starts computing checksums the copy here should be updated
 * in lockstep with the DTO.
 */

import type { V1VersionSummary } from '@/lib/api/v1/resources';
import { ShieldQuestion } from 'lucide-react';

interface Props {
  version: V1VersionSummary | null;
}

export default function ResourceVersionFileList({ version }: Props) {
  if (!version) {
    return (
      <div className="text-sm text-[var(--text-muted)]">暂无版本信息</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[var(--text)]">
          {version.display_version}
        </span>
        {version.is_legacy_root_release && (
          <span className="inline-flex items-center rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
            历史版本
          </span>
        )}
        <span className="text-xs text-[var(--text-muted)]">
          {version.file_count} 个文件
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <ShieldQuestion className="h-3.5 w-3.5" />
        <span>文件完整性：未验证的历史文件</span>
      </div>
    </div>
  );
}
