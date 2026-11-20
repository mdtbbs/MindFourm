'use client';

import { Fragment } from 'react';
import { useI18n } from '@/i18n/provider';
import type { MlogHunk, MlogLine } from '@/lib/api/v1/resource-visual-diff';

/**
 * Side-by-side mlog hunk view.
 *
 * Hunks arrive as unified-diff lines. The left column keeps context and
 * removed lines, the right column keeps context and added lines, and both are
 * rendered as plain text nodes so a `.mlog` payload can never inject markup.
 */

type RowKind = 'context' | 'removed' | 'added';

type AlignedRow = {
  key: string;
  kind: RowKind;
  beforeLine: number | null;
  beforeText: string | null;
  afterLine: number | null;
  afterText: string | null;
};

type AlignedHunk = { key: string; header: string | null; rows: AlignedRow[] };

function lineNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

function lineText(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function alignHunks(hunks: MlogHunk[]): AlignedHunk[] {
  return hunks.map((hunk, hunkIndex) => {
    let beforeCursor = 1;
    let afterCursor = 1;
    const rows: AlignedRow[] = [];
    (hunk.lines ?? []).forEach((line: MlogLine, lineIndex) => {
      const text = lineText(line.text);
      if (line.type === '+') {
        rows.push({
          key: `${hunkIndex}:${lineIndex}`,
          kind: 'added',
          beforeLine: null,
          beforeText: null,
          afterLine: lineNumber(line.after_line, afterCursor++),
          afterText: text,
        });
        return;
      }
      if (line.type === '-') {
        rows.push({
          key: `${hunkIndex}:${lineIndex}`,
          kind: 'removed',
          beforeLine: lineNumber(line.before_line, beforeCursor++),
          beforeText: text,
          afterLine: null,
          afterText: null,
        });
        return;
      }
      rows.push({
        key: `${hunkIndex}:${lineIndex}`,
        kind: 'context',
        beforeLine: lineNumber(line.before_line, beforeCursor++),
        beforeText: text,
        afterLine: lineNumber(line.after_line, afterCursor++),
        afterText: text,
      });
    });
    return {
      key: `hunk-${hunkIndex}`,
      header: typeof hunk.header === 'string' && hunk.header.trim() ? hunk.header : null,
      rows,
    };
  });
}

export default function MlogSplitDiff({ hunks, truncated = false }: { hunks: MlogHunk[]; truncated?: boolean }) {
  const { t } = useI18n();
  const aligned = alignHunks(Array.isArray(hunks) ? hunks : []);
  const hasContent = aligned.some((hunk) => hunk.header !== null || hunk.rows.length > 0);

  if (!hasContent) {
    return <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.mlog.empty')}</p>;
  }

  return <div className="min-w-0 space-y-2">
    <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[36rem] border-collapse font-mono text-xs leading-6" data-testid="mlog-split-diff">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]">
            <th colSpan={2} className="px-2 py-2 font-semibold">{t('visualDiff.mlog.before')}</th>
            <th colSpan={2} className="border-l border-[var(--border)] px-2 py-2 font-semibold">{t('visualDiff.mlog.after')}</th>
          </tr>
        </thead>
        <tbody>
          {aligned.map((hunk) => <Fragment key={hunk.key}>
            {hunk.header ? <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
              <th colSpan={4} scope="colgroup" className="px-2 py-1 text-left font-normal">{hunk.header}</th>
            </tr> : null}
            {hunk.rows.map((row) => <tr key={row.key} className="align-top" data-row-kind={row.kind}>
              <td className="w-10 select-none border-r border-[var(--border)] px-2 text-right text-[var(--text-muted)]">{row.beforeLine ?? ''}</td>
              <td className={`whitespace-pre px-2 ${row.kind === 'removed' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'text-[var(--text)]'}`}>{row.beforeText ?? ''}</td>
              <td className="w-10 select-none border-l border-r border-[var(--border)] px-2 text-right text-[var(--text-muted)]">{row.afterLine ?? ''}</td>
              <td className={`whitespace-pre px-2 ${row.kind === 'added' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'text-[var(--text)]'}`}>{row.afterText ?? ''}</td>
            </tr>)}
          </Fragment>)}
        </tbody>
      </table>
    </div>
    {truncated ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.mlog.truncated')}</p> : null}
  </div>;
}
