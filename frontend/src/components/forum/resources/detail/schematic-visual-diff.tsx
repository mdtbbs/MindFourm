'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type {
  MlogLogicDiff,
  SchematicVisualDiffData,
  VisualDiffBlockConfig,
  VisualDiffBlockRef,
  VisualDiffModifiedBlock,
  VisualDiffPair,
} from '@/lib/api/v1/resource-visual-diff';
import MlogSplitDiff from './mlog-split-diff';

/**
 * Schematic comparison: two aligned preview panes with an SVG block overlay,
 * the logic-processor list with mlog hunks, and materials/power tables.
 *
 * Block positions come from the server diff and are stored in schematic tile
 * coordinates; the SVG viewBox uses the schematic dimensions so the overlay
 * scales with the preview image.
 */

const FALLBACK_DIMENSION = 128;
const ADDED_COLOR = '#22c55e';
const REMOVED_COLOR = '#ef4444';
const MODIFIED_COLOR = '#f59e0b';

type LayerState = { added: boolean; removed: boolean; modified: boolean };

type LogicEntry = {
  id: string;
  keyLabel: string;
  logic: MlogLogicDiff;
  statusLabel: string;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dimension(value: unknown): number {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? Math.trunc(number) : FALLBACK_DIMENSION;
}

function pairValue(pair: VisualDiffPair | undefined, side: 'before' | 'after'): number | null {
  return pair ? finiteNumber(pair[side]) : null;
}

function describeConfig(config: VisualDiffBlockConfig | null | undefined): string {
  if (!config) return '—';
  const parts: string[] = [];
  if (finiteNumber(config.rotation) !== null) parts.push(String(Math.trunc(finiteNumber(config.rotation)!)));
  if (typeof config.config_type === 'string' && config.config_type) parts.push(config.config_type);
  return parts.length ? parts.join(' / ') : '—';
}

function blockName(block: string | null | undefined, fallback: string): string {
  return typeof block === 'string' && block ? block : fallback;
}

function blockPosition(block: VisualDiffBlockRef | VisualDiffModifiedBlock): { x: number | null; y: number | null } {
  return { x: finiteNumber(block.x), y: finiteNumber(block.y) };
}

function isProcessor(block: string | null | undefined): boolean {
  return typeof block === 'string' && block.toLowerCase().includes('processor');
}

function formatNumber(value: number | null, locale: string): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function pairDelta(pair: VisualDiffPair | undefined): number | null {
  if (!pair) return null;
  const declared = finiteNumber(pair.delta);
  if (declared !== null) return declared;
  const before = finiteNumber(pair.before);
  const after = finiteNumber(pair.after);
  return before !== null && after !== null ? after - before : null;
}

function formatDelta(value: number | null, locale: string): string {
  if (value === null) return '—';
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function previewUrl(resourcePublicId: string, versionPublicId: string | null): string | null {
  if (!versionPublicId) return null;
  return `/api/v1/resources/${encodeURIComponent(resourcePublicId)}/versions/${encodeURIComponent(versionPublicId)}/preview`;
}

function DiffPane({
  pane,
  label,
  versionLabel,
  imageUrl,
  width,
  height,
  placeholder,
  children,
}: {
  pane: 'from' | 'to';
  label: string;
  versionLabel: string | null;
  imageUrl: string | null;
  width: number;
  height: number;
  placeholder: string;
  children: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return <figure className="min-w-0 space-y-2">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="font-semibold text-[var(--text)]">{label}</span>
      {versionLabel ? <span className="break-all font-mono text-xs text-[var(--text-muted)]">{versionLabel}</span> : null}
    </figcaption>
    <div className="relative w-full overflow-hidden rounded-md border border-[var(--border)] bg-[#101419]" style={{ aspectRatio: `${width} / ${height}` }}>
      {imageUrl && !failed
        ? <img src={imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" onError={() => setFailed(true)} />
        : <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-[var(--text-muted)]">{placeholder}</div>}
      <svg
        aria-label={label}
        data-diff-pane={pane}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {children}
      </svg>
    </div>
  </figure>;
}

export default function SchematicVisualDiff({
  resourcePublicId,
  fromVersionPublicId,
  toVersionPublicId,
  fromVersionLabel = null,
  toVersionLabel = null,
  diff,
}: {
  resourcePublicId: string;
  fromVersionPublicId: string | null;
  toVersionPublicId: string | null;
  fromVersionLabel?: string | null;
  toVersionLabel?: string | null;
  diff: SchematicVisualDiffData;
}) {
  const { t, locale } = useI18n();
  const [layers, setLayers] = useState<LayerState>({ added: true, removed: true, modified: true });
  const [selectedLogic, setSelectedLogic] = useState<string | null>(null);
  const width = dimension(diff.metadata?.width?.after ?? diff.metadata?.width?.before);
  const height = dimension(diff.metadata?.height?.after ?? diff.metadata?.height?.before);
  const added = diff.blocks?.added ?? [];
  const removed = diff.blocks?.removed ?? [];
  const modified = diff.blocks?.modified ?? [];
  const logicDiffs = diff.logic_diffs ?? [];
  const materials = diff.materials_delta ?? [];
  const power = diff.power_delta ?? null;
  const missing = t('visualDiff.valueMissing');

  const logicEntries: LogicEntry[] = logicDiffs.map((logic, index) => {
    const status = logic.status ?? '';
    const statusLabel = status === 'added'
      ? t('visualDiff.schematic.logicStatusAdded')
      : status === 'removed'
        ? t('visualDiff.schematic.logicStatusRemoved')
        : status === 'modified'
          ? t('visualDiff.schematic.logicStatusModified')
          : status || missing;
    return {
      id: String(logic.key ?? `logic-${index}`),
      keyLabel: String(logic.key ?? `#${index + 1}`),
      logic,
      statusLabel,
    };
  });

  const selectProcessor = (x: number | null, y: number | null) => {
    if (x === null || y === null) return;
    const match = logicEntries.find(({ logic }) => (
      (logic.before && finiteNumber(logic.before.x) === x && finiteNumber(logic.before.y) === y)
      || (logic.after && finiteNumber(logic.after.x) === x && finiteNumber(logic.after.y) === y)
    ));
    if (match) setSelectedLogic(match.id);
  };

  const blockRect = (
    key: string,
    color: string,
    title: string,
    name: string,
    x: number | null,
    y: number | null,
  ) => {
    if (x === null || y === null) return null;
    const clickable = isProcessor(name) && logicEntries.length > 0;
    return <rect
      key={key}
      x={x}
      y={y}
      width={1}
      height={1}
      fill={color}
      fillOpacity={0.85}
      stroke={color}
      strokeWidth={0.15}
      className={clickable ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? 'button' : undefined}
      aria-label={clickable ? t('visualDiff.schematic.openLogicAt', { x, y }) : undefined}
      onClick={clickable ? () => selectProcessor(x, y) : undefined}
      onKeyDown={clickable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectProcessor(x, y);
        }
      } : undefined}
    >
      <title>{title}</title>
    </rect>;
  };

  const fromRects: ReactNode[] = [];
  const toRects: ReactNode[] = [];
  if (layers.removed) {
    removed.forEach((block, index) => {
      const { x, y } = blockPosition(block);
      const name = blockName(block.block, missing);
      const title = `${t('visualDiff.schematic.statusRemoved')} · ${name} (${x ?? '—'}, ${y ?? '—'}) · ${describeConfig(block)}`;
      const rect = blockRect(`removed:${index}`, REMOVED_COLOR, title, name, x, y);
      if (rect) fromRects.push(rect);
    });
  }
  if (layers.modified) {
    modified.forEach((block, index) => {
      const { x, y } = blockPosition(block);
      const name = blockName(block.block, missing);
      const title = `${t('visualDiff.schematic.statusModified')} · ${name} (${x ?? '—'}, ${y ?? '—'}) · ${describeConfig(block.before)} → ${describeConfig(block.after)}`;
      const fromRect = blockRect(`modified-from:${index}`, MODIFIED_COLOR, title, name, x, y);
      const toRect = blockRect(`modified-to:${index}`, MODIFIED_COLOR, title, name, x, y);
      if (fromRect) fromRects.push(fromRect);
      if (toRect) toRects.push(toRect);
    });
  }
  if (layers.added) {
    added.forEach((block, index) => {
      const { x, y } = blockPosition(block);
      const name = blockName(block.block, missing);
      const title = `${t('visualDiff.schematic.statusAdded')} · ${name} (${x ?? '—'}, ${y ?? '—'}) · ${describeConfig(block)}`;
      const rect = blockRect(`added:${index}`, ADDED_COLOR, title, name, x, y);
      if (rect) toRects.push(rect);
    });
  }

  const toggleLayer = (layer: keyof LayerState) => setLayers((current) => ({ ...current, [layer]: !current[layer] }));

  const powerRows = power ? [
    { id: 'production', label: t('visualDiff.schematic.powerProduction'), pair: power.production },
    { id: 'consumption', label: t('visualDiff.schematic.powerConsumption'), pair: power.consumption },
    { id: 'net', label: t('visualDiff.schematic.powerNet'), pair: power.net },
  ].filter((row) => row.pair !== undefined) : [];

  return <section className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
      <span className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.schematic.layersTitle')}</span>
      {(['added', 'removed', 'modified'] as const).map((layer) => <label key={layer} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" checked={layers[layer]} onChange={() => toggleLayer(layer)} className="h-4 w-4 accent-[var(--primary)]" />
        {t(`visualDiff.schematic.layers${layer.charAt(0).toUpperCase()}${layer.slice(1)}`)}
      </label>)}
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <DiffPane
        pane="from"
        label={t('visualDiff.schematic.fromPane')}
        versionLabel={fromVersionLabel}
        imageUrl={previewUrl(resourcePublicId, fromVersionPublicId)}
        width={width}
        height={height}
        placeholder={t('visualDiff.schematic.previewMissing')}
      >
        {fromRects}
      </DiffPane>
      <DiffPane
        pane="to"
        label={t('visualDiff.schematic.toPane')}
        versionLabel={toVersionLabel}
        imageUrl={previewUrl(resourcePublicId, toVersionPublicId)}
        width={width}
        height={height}
        placeholder={t('visualDiff.schematic.previewMissing')}
      >
        {toRects}
      </DiffPane>
    </div>
    {diff.blocks?.truncated ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.schematic.blocksTruncated')}</p> : null}

    <section className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.schematic.materialTitle')}</h4>
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary-text)]">{t('visualDiff.estimated')}</span>
      </div>
      {materials.length ? <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[26rem] text-sm">
          <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.schematic.materialItem')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.schematic.materialBefore')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.schematic.materialAfter')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.schematic.materialDelta')}</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((row, index) => <tr key={`${row.item ?? 'item'}:${index}`} className="border-t border-[var(--border)]">
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text)]">{row.item ?? missing}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(finiteNumber(row.before), locale)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(finiteNumber(row.after), locale)}</td>
              <td className="px-3 py-2 text-right text-[var(--text)]">{formatDelta(finiteNumber(row.delta) ?? (finiteNumber(row.before) !== null && finiteNumber(row.after) !== null ? finiteNumber(row.after)! - finiteNumber(row.before)! : null), locale)}</td>
            </tr>)}
          </tbody>
        </table>
      </div> : <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.schematic.materialEmpty')}</p>}
    </section>

    <section className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.schematic.powerTitle')}</h4>
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary-text)]">{t('visualDiff.estimated')}</span>
      </div>
      {powerRows.length ? <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[26rem] text-sm">
          <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.schematic.powerTitle')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.schematic.powerBefore')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.schematic.powerAfter')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.schematic.powerDelta')}</th>
            </tr>
          </thead>
          <tbody>
            {powerRows.map((row) => <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="px-3 py-2 text-[var(--text)]">{row.label} <span className="ml-1 rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] text-[var(--primary-text)]">{t('visualDiff.estimated')}</span></td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(pairValue(row.pair, 'before'), locale)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(pairValue(row.pair, 'after'), locale)}</td>
              <td className="px-3 py-2 text-right text-[var(--text)]">{formatDelta(pairDelta(row.pair), locale)}</td>
            </tr>)}
          </tbody>
        </table>
      </div> : <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.schematic.powerEmpty')}</p>}
      <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.schematic.powerEstimateNote')}</p>
    </section>

    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.schematic.logicTitle')}</h4>
        {diff.logic_truncated ? <span className="text-xs text-[var(--text-muted)]">{t('visualDiff.schematic.logicTruncated')}</span> : null}
      </div>
      {logicEntries.length ? <ul className="space-y-2">
        {logicEntries.map(({ id, keyLabel, logic, statusLabel }) => {
          const open = selectedLogic === id;
          const processorType = logic.after?.processor_type || logic.before?.processor_type || missing;
          const position = logic.after ?? logic.before ?? null;
          const links = logic.links ?? null;
          const linkAdded = links?.added ?? [];
          const linkRemoved = links?.removed ?? [];
          return <li key={id} className="rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setSelectedLogic(open ? null : id)}
              className="flex min-h-11 w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm"
            >
              <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
              <span className="break-all font-mono text-xs text-[var(--text)]">{keyLabel}</span>
              <span className="text-[var(--text-secondary)]">{processorType}</span>
              <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{statusLabel}</span>
              {position && (finiteNumber(position.x) !== null || finiteNumber(position.y) !== null) ? <span className="font-mono text-xs text-[var(--text-muted)]">({finiteNumber(position.x) ?? '—'}, {finiteNumber(position.y) ?? '—'})</span> : null}
            </button>
            {open ? <div className="space-y-3 border-t border-[var(--border)] p-3">
              <MlogSplitDiff hunks={logic.hunks ?? []} truncated={Boolean(logic.truncated)} />
              {linkAdded.length || linkRemoved.length ? <div className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                {linkAdded.length ? <p>{t('visualDiff.schematic.logicLinksAdded')}: {linkAdded.map((link) => `${link.name ?? '—'} (${finiteNumber(link.x) ?? '—'}, ${finiteNumber(link.y) ?? '—'})`).join(', ')}</p> : null}
                {linkRemoved.length ? <p>{t('visualDiff.schematic.logicLinksRemoved')}: {linkRemoved.map((link) => `${link.name ?? '—'} (${finiteNumber(link.x) ?? '—'}, ${finiteNumber(link.y) ?? '—'})`).join(', ')}</p> : null}
              </div> : null}
            </div> : null}
          </li>;
        })}
      </ul> : <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.schematic.logicEmpty')}</p>}
    </section>
  </section>;
}
