'use client';

/**
 * V1 resource detail renderer.
 *
 * Shown when the backend `feature_resources_v1_detail_enabled` flag is
 * on and the V1 endpoint returns data. The legacy `<ResourceDetail>`
 * component remains in place for the fallback path — this component
 * intentionally does not try to replicate its edit/delete actions,
 * which are not yet available in the V1 surface.
 */

import { V1ResourceDetail } from '@/lib/api/v1/resources';
import ResourceAttributionList from './resource-attribution-list';
import ResourceVersionFileList from './resource-version-file-list';
import { Download, Package } from 'lucide-react';

interface Props {
  resource: V1ResourceDetail;
}

export default function ResourceDetailV1({ resource }: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center text-4xl">
              📦
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <h1 className="text-3xl font-bold text-[var(--text)] mb-2">
                {resource.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                {resource.resource_kind && (
                  <span className="inline-flex items-center rounded bg-[var(--bg-secondary)] px-2 py-0.5 text-xs">
                    {resource.resource_kind}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Download className="w-4 h-4" />
                  {resource.download_count} 次下载
                </span>
              </div>
            </div>

            {resource.summary && (
              <p className="text-[var(--text-muted)] text-sm">{resource.summary}</p>
            )}
          </div>
        </div>
      </div>

      {/* Version + Files Section */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
          <Package className="w-5 h-5" />
          版本与文件
        </h2>
        <ResourceVersionFileList version={resource.latest_version} />
      </div>

      {/* Attribution Section */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
        <ResourceAttributionList attributions={resource.attributions} />
      </div>
    </div>
  );
}
