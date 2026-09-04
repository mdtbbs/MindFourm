'use client';

/**
 * Renders the attribution list for a V1 resource.
 *
 * Each entry shows a role label (submitter / original author / ...) and
 * the attributed name. The component is intentionally small — it sits
 * in the resource detail sidebar and must not compete with the main
 * content area.
 */

import type { V1AttributionSummary } from '@/lib/api/v1/resources';

interface Props {
  attributions: V1AttributionSummary[];
}

const ROLE_LABELS: Record<string, string> = {
  submitter: '上传者',
  original_author: '原作者',
  maintainer: '维护者',
  publisher: '发布者',
  contributor: '贡献者',
};

function formatAttributionName(attr: V1AttributionSummary): string {
  if (attr.display_name) return attr.display_name;
  if (attr.subject_type === 'local_user') return `用户 #${attr.id}`;
  return attr.subject_type;
}

export default function ResourceAttributionList({ attributions }: Props) {
  if (attributions.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--text-muted)]">贡献者</h3>
      <ul className="space-y-1">
        {attributions.map((attr) => (
          <li key={`${attr.subject_type}:${attr.id}`} className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
              {ROLE_LABELS[attr.role] ?? attr.role}
            </span>
            <span className="text-[var(--text)]">{formatAttributionName(attr)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
