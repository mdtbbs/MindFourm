'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { getSchematicLogic, type SchematicLogicItem } from '@/lib/api/v1/resource-visual-diff';

/**
 * Current-version built-in mlog viewer.
 *
 * This panel is rendered even when no version pair exists yet, so a resource
 * card's “查看内置 mlog” link always lands on readable processors. The server
 * only returns inert source text and static audit findings; nothing is executed.
 */
export default function SchematicLogicPanel({
  resourcePublicId,
  versionPublicId,
}: {
  resourcePublicId: string;
  versionPublicId: string | null;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<SchematicLogicItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!resourcePublicId || !versionPublicId) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    setItems(null);
    setFailed(false);
    void getSchematicLogic(resourcePublicId, versionPublicId, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setItems(result.items); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [resourcePublicId, versionPublicId]);

  return <section id="resource-logic" className="space-y-2">
    <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.schematic.currentLogicTitle')}</h4>
    {items === null && !failed ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('visualDiff.schematic.currentLogicLoading')}</p> : null}
    {failed ? <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.schematic.currentLogicUnavailable')}</p> : null}
    {items !== null && items.length === 0 ? <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.schematic.currentLogicEmpty')}</p> : null}
    {items && items.length ? <ul className="space-y-2">
      {items.map((processor, index) => {
        const findings = processor.audit_findings ?? [];
        return <li key={`${processor.processor_type}:${processor.x ?? ''}:${processor.y ?? ''}:${index}`} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
          <details>
            <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="text-[var(--text)]">{processor.processor_type || t('visualDiff.valueMissing')}</span>
              <span className="font-mono text-xs text-[var(--text-muted)]">({processor.x ?? '—'}, {processor.y ?? '—'})</span>
              <span className="text-xs text-[var(--text-muted)]">{t('visualDiff.schematic.currentLogicInstructions')}: {processor.instruction_count ?? 0}</span>
              {processor.estimated_cycle_ticks != null ? <span className="text-xs text-[var(--text-muted)]">{t('visualDiff.schematic.currentLogicTicks')}: {processor.estimated_cycle_ticks}</span> : null}
              {processor.has_warnings ? <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">{t('visualDiff.schematic.currentLogicWarnings')}: {findings.length}</span> : null}
            </summary>
            <div className="space-y-2 border-t border-[var(--border)] p-3">
              {processor.logic_source ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--bg-elevated)] p-3 font-mono text-xs text-[var(--text)]">{processor.logic_source}</pre>
                : <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.schematic.currentLogicUnavailable')}</p>}
              {processor.source_truncated ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.schematic.currentLogicTruncated')}</p> : null}
              {findings.length ? <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                {findings.slice(0, 10).map((finding, findingIndex) => <li key={`${finding.code || 'finding'}:${findingIndex}`}>
                  <span className="mr-1 font-mono text-[var(--text-muted)]">{finding.code}</span>
                  {finding.line != null ? <span className="mr-1 text-[var(--text-muted)]">L{finding.line}</span> : null}
                  {finding.message}
                </li>)}
              </ul> : null}
            </div>
          </details>
        </li>;
      })}
    </ul> : null}
  </section>;
}
