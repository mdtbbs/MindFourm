'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '@/i18n/provider';
import {
  getMapDiffChunk,
  getMapDiffOverlayUrl,
  type MapDiffChunkData,
  type MapDiffChunkResponse,
  type MapResourceDelta,
  type MapTerrainChunkSummary,
  type MapVisualDiffData,
  type MapWaveCurvePoint,
} from '@/lib/api/v1/resource-visual-diff';

/**
 * Map comparison: canvas (swipe / overlay heatmap / split), rules, waves and
 * objects/resources. All geometry and charts are inline SVG or CSS; no chart
 * library is involved, and the only server-generated image is the optional
 * diff overlay PNG.
 */

const TABS = ['canvas', 'rules', 'waves', 'objects'] as const;
type TabKey = (typeof TABS)[number];
type CanvasMode = 'swipe' | 'heatmap' | 'split';
type SeriesKey = 'beforeHealth' | 'afterHealth' | 'beforeStrength' | 'afterStrength';

const SERIES_COLORS: Record<SeriesKey, string> = {
  beforeHealth: '#94a3b8',
  afterHealth: '#0ea5e9',
  beforeStrength: '#f59e0b',
  afterStrength: '#22c55e',
};

type ChartPoint = { x: number; y: number };
type ChartSeries = { id: SeriesKey; label: string; color: string; points: ChartPoint[] };

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null | undefined, locale: string, missing: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return missing;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function safeJsonText(value: unknown, missing: string, max = 200): string {
  try {
    const text = JSON.stringify(value);
    if (typeof text !== 'string') return missing;
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return missing;
  }
}

function previewUrl(resourcePublicId: string, versionPublicId: string | null): string | null {
  if (!versionPublicId) return null;
  return `/api/v1/resources/${encodeURIComponent(resourcePublicId)}/versions/${encodeURIComponent(versionPublicId)}/preview`;
}

function parseCoordinate(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1_000_000, parsed)) : 0;
}

function MapPreview({
  imageUrl,
  alt,
  placeholder,
  className,
  style,
}: {
  imageUrl: string | null;
  alt: string;
  placeholder: string;
  className: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  if (!imageUrl || failed) {
    return <div className={`flex items-center justify-center p-3 text-center text-xs text-[var(--text-muted)] ${className}`} style={style}>{placeholder}</div>;
  }
  return <img src={imageUrl} alt={alt} loading="lazy" className={className} style={style} onError={() => setFailed(true)} />;
}

function ChunkHeatmap({ chunks, label }: { chunks: MapTerrainChunkSummary[]; label: string }) {
  const { t } = useI18n();
  if (!chunks.length) return <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.map.canvas.terrainEmpty')}</p>;
  const maxCx = Math.max(...chunks.map((chunk) => finiteNumber(chunk.cx) ?? 0));
  const maxCy = Math.max(...chunks.map((chunk) => finiteNumber(chunk.cy) ?? 0));
  const floorLabel = t('visualDiff.map.canvas.floor');
  const overlayLabel = t('visualDiff.map.canvas.overlay');
  const changedLabel = t('visualDiff.changed');
  const unchangedLabel = t('visualDiff.unchanged');
  const title = (chunk: MapTerrainChunkSummary) => t('visualDiff.map.canvas.chunkCellTitle', {
    cx: finiteNumber(chunk.cx) ?? 0,
    cy: finiteNumber(chunk.cy) ?? 0,
    floor: chunk.floor_changed ? changedLabel : unchangedLabel,
    overlay: chunk.overlay_changed ? changedLabel : unchangedLabel,
  });

  if (maxCx > 63 || maxCy > 63) {
    // A coordinate far outside a normal map would produce a mostly empty huge
    // grid; a compact list keeps every changed chunk visible instead.
    return <ul className="space-y-1 text-xs" aria-label={label}>
      {chunks.slice(0, 200).map((chunk, index) => <li key={`${chunk.cx}:${chunk.cy}:${index}`} className="rounded bg-[var(--bg-elevated)] px-2 py-1 font-mono text-[var(--text-secondary)]" title={title(chunk)}>
        ({finiteNumber(chunk.cx) ?? 0}, {finiteNumber(chunk.cy) ?? 0}) · {floorLabel}: {chunk.floor_changed ? changedLabel : unchangedLabel} · {overlayLabel}: {chunk.overlay_changed ? changedLabel : unchangedLabel}
      </li>)}
    </ul>;
  }

  return <div
    role="img"
    aria-label={label}
    className="grid w-full gap-0.5"
    style={{ gridTemplateColumns: `repeat(${Math.max(1, maxCx + 1)}, minmax(0, 1fr))` }}
  >
    {chunks.map((chunk, index) => {
      const cx = finiteNumber(chunk.cx) ?? 0;
      const cy = finiteNumber(chunk.cy) ?? 0;
      const tone = chunk.floor_changed && chunk.overlay_changed
        ? 'bg-red-500'
        : chunk.floor_changed
          ? 'bg-amber-500'
          : chunk.overlay_changed
            ? 'bg-sky-500'
            : 'bg-[var(--bg-elevated)]';
      return <div
        key={`${cx}:${cy}:${index}`}
        className={`aspect-square w-full rounded-[1px] ${tone}`}
        style={{ gridColumnStart: cx + 1, gridRowStart: cy + 1 }}
        title={title(chunk)}
      />;
    })}
  </div>;
}

function chartPoints(curve: MapWaveCurvePoint[], pick: (point: MapWaveCurvePoint) => number | null): ChartPoint[] {
  return curve.flatMap((point) => {
    const x = finiteNumber(point.wave_start);
    const y = pick(point);
    return x !== null && y !== null ? [{ x, y }] : [];
  }).sort((a, b) => a.x - b.x);
}

function WaveChart({
  title,
  ariaLabel,
  series,
  allEmpty,
}: {
  title: string;
  ariaLabel: string;
  series: ChartSeries[];
  allEmpty: boolean;
}) {
  const { t, locale } = useI18n();
  if (allEmpty) return <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.map.waves.empty')}</p>;
  const visible = series.filter((item) => item.points.length > 0);
  if (!visible.length) return <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.map.waves.legendEmpty')}</p>;
  const xs = visible.flatMap((item) => item.points.map((point) => point.x));
  const ys = visible.flatMap((item) => item.points.map((point) => point.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(1, ...ys);
  const width = 320;
  const height = 150;
  const pad = 12;
  const sx = (value: number) => (maxX === minX ? width / 2 : pad + ((value - minX) / (maxX - minX)) * (width - pad * 2));
  const sy = (value: number) => height - pad - (Math.max(0, value) / maxY) * (height - pad * 2);
  return <figure className="min-w-0 space-y-1">
    <figcaption className="text-sm font-semibold text-[var(--text)]">{title}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="h-auto w-full min-h-32 rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="currentColor" strokeOpacity={0.3} />
      {visible.map((item) => <polyline
        key={item.id}
        points={item.points.map((point) => `${sx(point.x)},${sy(point.y)}`).join(' ')}
        fill="none"
        stroke={item.color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <title>{item.label}</title>
      </polyline>)}
      <text x={pad} y={height - 2} fontSize={9} fill="currentColor" opacity={0.6}>{minX}</text>
      <text x={width - pad} y={height - 2} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.6}>{maxX}</text>
      <text x={pad} y={pad} fontSize={9} fill="currentColor" opacity={0.6}>{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(maxY)}</text>
    </svg>
  </figure>;
}

export default function MapVisualDiff({
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
  diff: MapVisualDiffData;
}) {
  const { t, locale } = useI18n();
  const baseId = useId();
  const [tab, setTab] = useState<TabKey>('canvas');
  const [mode, setMode] = useState<CanvasMode>('swipe');
  const [swipePercent, setSwipePercent] = useState(50);
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    beforeHealth: true, afterHealth: true, beforeStrength: true, afterStrength: true,
  });
  const [overlayFailed, setOverlayFailed] = useState(false);
  const [chunkX, setChunkX] = useState('0');
  const [chunkY, setChunkY] = useState('0');
  const [chunkResponse, setChunkResponse] = useState<MapDiffChunkResponse | null>(null);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [chunkError, setChunkError] = useState(false);
  const chunkController = useRef<AbortController | null>(null);

  const missing = t('visualDiff.valueMissing');
  const fromPreview = previewUrl(resourcePublicId, fromVersionPublicId);
  const toPreview = previewUrl(resourcePublicId, toVersionPublicId);
  const chunks = diff.terrain_chunks_summary ?? [];
  const changedChunks = chunks.filter((chunk) => chunk.floor_changed || chunk.overlay_changed).length;
  const resources = diff.resources_delta ?? [];
  const counts = diff.objects_diff?.counts ?? null;

  useEffect(() => () => chunkController.current?.abort(), []);

  useEffect(() => {
    chunkController.current?.abort();
    setChunkResponse(null);
    setChunkError(false);
    setChunkLoading(false);
  }, [resourcePublicId, fromVersionPublicId, toVersionPublicId]);

  // A missing overlay (404) is a normal degraded state; let the next mode or
  // version switch try the same-origin image URL again.
  useEffect(() => {
    setOverlayFailed(false);
  }, [mode, resourcePublicId, fromVersionPublicId, toVersionPublicId]);

  const overlayUrl = getMapDiffOverlayUrl(resourcePublicId, { fromVersionPublicId, toVersionPublicId });

  const chunkMetadataOnly = chunkResponse?.status === 'metadata_only';

  const loadChunk = () => {
    chunkController.current?.abort();
    const controller = new AbortController();
    chunkController.current = controller;
    const cx = parseCoordinate(chunkX);
    const cy = parseCoordinate(chunkY);
    setChunkX(String(cx));
    setChunkY(String(cy));
    setChunkLoading(true);
    setChunkError(false);
    getMapDiffChunk(resourcePublicId, {
      fromVersionPublicId,
      toVersionPublicId,
      cx,
      cy,
      signal: controller.signal,
    }).then((response) => {
      if (!controller.signal.aborted) setChunkResponse(response);
    }).catch(() => {
      if (!controller.signal.aborted) setChunkError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setChunkLoading(false);
    });
  };

  const chunkText = (chunk: MapDiffChunkData): string => {
    const floorRuns = chunk.floorRuns ?? [];
    const overlayRuns = chunk.overlayRuns ?? [];
    const runLine = (run: NonNullable<MapDiffChunkData['floorRuns']>[number]) => `(${finiteNumber(run.x) ?? 0}, ${finiteNumber(run.y) ?? 0}) ×${finiteNumber(run.length) ?? 0} ${run.from ?? missing} → ${run.to ?? missing}`;
    const lines: string[] = [];
    lines.push(`${t('visualDiff.map.chunk.floorRuns')}: ${floorRuns.length}`);
    if (floorRuns.length) lines.push(...floorRuns.slice(0, 20).map(runLine));
    else lines.push(t('visualDiff.map.chunk.noRuns'));
    lines.push(`${t('visualDiff.map.chunk.overlayRuns')}: ${overlayRuns.length}`);
    if (overlayRuns.length) lines.push(...overlayRuns.slice(0, 20).map(runLine));
    else lines.push(t('visualDiff.map.chunk.noRuns'));
    if (chunk.truncated) lines.push(t('visualDiff.map.chunk.truncated'));
    return lines.join('\n');
  };

  const rules = diff.rules_diff ?? null;
  const ruleAdded = rules?.added ?? [];
  const ruleRemoved = rules?.removed ?? [];
  const ruleChanged = rules?.changed ?? [];
  const bannedBlocks = rules?.banned_blocks ?? null;
  const bannedUnits = rules?.banned_units ?? null;
  const loadout = rules?.loadout ?? null;
  const hasRules = Boolean(
    ruleAdded.length || ruleRemoved.length || ruleChanged.length
    || bannedBlocks?.added?.length || bannedBlocks?.removed?.length
    || bannedUnits?.added?.length || bannedUnits?.removed?.length
    || loadout?.added?.length || loadout?.removed?.length
    || rules?.unknown_rules_changed,
  );

  const beforeCurve = diff.waves_diff?.curve?.before ?? [];
  const afterCurve = diff.waves_diff?.curve?.after ?? [];
  const waveGroups = diff.waves_diff?.groups ?? null;
  const waveCount = diff.waves_diff?.wave_count ?? null;
  const seriesLabels: Record<SeriesKey, string> = {
    beforeHealth: t('visualDiff.map.waves.legendBeforeHealth'),
    afterHealth: t('visualDiff.map.waves.legendAfterHealth'),
    beforeStrength: t('visualDiff.map.waves.legendBeforeStrength'),
    afterStrength: t('visualDiff.map.waves.legendAfterStrength'),
  };
  const allHealthSeries: ChartSeries[] = [
    { id: 'beforeHealth', label: seriesLabels.beforeHealth, color: SERIES_COLORS.beforeHealth, points: chartPoints(beforeCurve, (point) => finiteNumber(point.estimated_health)) },
    { id: 'afterHealth', label: seriesLabels.afterHealth, color: SERIES_COLORS.afterHealth, points: chartPoints(afterCurve, (point) => finiteNumber(point.estimated_health)) },
  ];
  const allStrengthSeries: ChartSeries[] = [
    { id: 'beforeStrength', label: seriesLabels.beforeStrength, color: SERIES_COLORS.beforeStrength, points: chartPoints(beforeCurve, (point) => finiteNumber(point.strength)) },
    { id: 'afterStrength', label: seriesLabels.afterStrength, color: SERIES_COLORS.afterStrength, points: chartPoints(afterCurve, (point) => finiteNumber(point.strength)) },
  ];
  const healthSeries = allHealthSeries.filter((series) => visibleSeries[series.id]);
  const strengthSeries = allStrengthSeries.filter((series) => visibleSeries[series.id]);
  const healthEmpty = allHealthSeries.every((series) => series.points.length === 0);
  const strengthEmpty = allStrengthSeries.every((series) => series.points.length === 0);

  const waveRows = (() => {
    const rows = new Map<number, { wave: number; healthBefore: number | null; healthAfter: number | null; strengthBefore: number | null; strengthAfter: number | null }>();
    const row = (wave: number) => {
      const current = rows.get(wave);
      if (current) return current;
      const created = { wave, healthBefore: null, healthAfter: null, strengthBefore: null, strengthAfter: null };
      rows.set(wave, created);
      return created;
    };
    for (const point of beforeCurve) {
      const wave = finiteNumber(point.wave_start);
      if (wave === null) continue;
      const target = row(wave);
      target.healthBefore = finiteNumber(point.estimated_health);
      target.strengthBefore = finiteNumber(point.strength);
    }
    for (const point of afterCurve) {
      const wave = finiteNumber(point.wave_start);
      if (wave === null) continue;
      const target = row(wave);
      target.healthAfter = finiteNumber(point.estimated_health);
      target.strengthAfter = finiteNumber(point.strength);
    }
    return [...rows.values()].sort((a, b) => a.wave - b.wave).slice(0, 20);
  })();

  const countRows = [
    { id: 'cores', label: t('visualDiff.map.objects.cores'), pair: counts?.cores ?? null },
    { id: 'spawns', label: t('visualDiff.map.objects.spawns'), pair: counts?.spawns ?? null },
    { id: 'buildings', label: t('visualDiff.map.objects.buildings'), pair: counts?.buildings ?? null },
  ];
  const objectCount = countRows.filter((row) => row.pair).length;
  const resourceKindLabel = (kind: string | null | undefined) => {
    if (kind === 'ore') return t('visualDiff.map.objects.kindOre');
    if (kind === 'wall_ore') return t('visualDiff.map.objects.kindWallOre');
    if (kind === 'liquid') return t('visualDiff.map.objects.kindLiquid');
    return kind || missing;
  };
  const deltaOf = (pair: { before?: number | null; after?: number | null } | null) => {
    const before = finiteNumber(pair?.before);
    const after = finiteNumber(pair?.after);
    return before !== null && after !== null ? after - before : null;
  };

  const tabPanelId = (key: TabKey) => `${baseId}-panel-${key}`;
  const tabButtonId = (key: TabKey) => `${baseId}-tab-${key}`;

  const tabLabels: Record<TabKey, string> = {
    canvas: t('visualDiff.map.tabCanvas'),
    rules: t('visualDiff.map.tabRules'),
    waves: t('visualDiff.map.tabWaves'),
    objects: t('visualDiff.map.tabObjects'),
  };

  return <section className="min-w-0 space-y-4">
    <div role="tablist" aria-label={t('visualDiff.map.tabsAria')} className="flex flex-wrap gap-1 border-b border-[var(--border)]">
      {TABS.map((key) => <button
        key={key}
        type="button"
        role="tab"
        id={tabButtonId(key)}
        aria-selected={tab === key}
        aria-controls={tabPanelId(key)}
        onClick={() => setTab(key)}
        className={`min-h-11 rounded-t-md px-3 text-sm font-semibold ${tab === key ? 'bg-[var(--bg-elevated)] text-[var(--primary-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
      >
        {tabLabels[key]}
      </button>)}
    </div>

    {tab === 'canvas' ? <div role="tabpanel" id={tabPanelId('canvas')} aria-labelledby={tabButtonId('canvas')} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.canvas.modeLegend')}</span>
        {(['swipe', 'heatmap', 'split'] as const).map((item) => <button
          key={item}
          type="button"
          aria-pressed={mode === item}
          onClick={() => setMode(item)}
          className={`min-h-11 rounded-md border px-3 text-sm font-medium ${mode === item ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--primary)]'}`}
        >
          {t(`visualDiff.map.canvas.mode${item.charAt(0).toUpperCase()}${item.slice(1)}`)}
        </button>)}
      </div>

      {mode === 'swipe' ? <div className="space-y-2">
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-[var(--border)] bg-[#101419]">
          <MapPreview
            imageUrl={fromPreview}
            alt={`${t('visualDiff.map.fromPane')} ${fromVersionLabel ?? ''}`.trim()}
            placeholder={t('visualDiff.map.previewMissing')}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <MapPreview
            imageUrl={toPreview}
            alt={`${t('visualDiff.map.toPane')} ${toVersionLabel ?? ''}`.trim()}
            placeholder={t('visualDiff.map.previewMissing')}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ clipPath: `inset(0 0 0 ${swipePercent}%)` }}
          />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--primary)]" style={{ left: `${swipePercent}%` }} />
        </div>
        <label className="flex min-h-11 flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span>{t('visualDiff.map.canvas.swipeLabel')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={swipePercent}
            onChange={(event) => setSwipePercent(Number(event.target.value))}
            aria-label={t('visualDiff.map.canvas.swipeSlider')}
            className="min-h-11 min-w-40 flex-1 accent-[var(--primary)]"
          />
        </label>
      </div> : null}

      {mode === 'heatmap' ? <div className="space-y-2">
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-[var(--border)] bg-[#101419]">
          {!overlayFailed ? <img
            src={overlayUrl}
            alt={t('visualDiff.map.canvas.overlayAlt')}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain"
            onError={() => setOverlayFailed(true)}
          /> : null}
          {overlayFailed ? <div className="absolute inset-0 overflow-auto p-2">
            <ChunkHeatmap chunks={chunks} label={t('visualDiff.map.canvas.heatmapLabel')} />
          </div> : null}
        </div>
        {overlayFailed ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.canvas.overlayFailed')}</p> : null}
      </div> : null}

      {mode === 'split' ? <div className="grid gap-3 sm:grid-cols-2">
        <figure className="min-w-0 space-y-1">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="font-semibold text-[var(--text)]">{t('visualDiff.map.fromPane')}</span>{fromVersionLabel ? <span className="break-all font-mono text-xs text-[var(--text-muted)]">{fromVersionLabel}</span> : null}</figcaption>
          <div className="relative aspect-[16/9] overflow-hidden rounded-md border border-[var(--border)] bg-[#101419]">
            <MapPreview imageUrl={fromPreview} alt={t('visualDiff.map.fromPane')} placeholder={t('visualDiff.map.previewMissing')} className="absolute inset-0 h-full w-full object-contain" />
          </div>
        </figure>
        <figure className="min-w-0 space-y-1">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="font-semibold text-[var(--text)]">{t('visualDiff.map.toPane')}</span>{toVersionLabel ? <span className="break-all font-mono text-xs text-[var(--text-muted)]">{toVersionLabel}</span> : null}</figcaption>
          <div className="relative aspect-[16/9] overflow-hidden rounded-md border border-[var(--border)] bg-[#101419]">
            <MapPreview imageUrl={toPreview} alt={t('visualDiff.map.toPane')} placeholder={t('visualDiff.map.previewMissing')} className="absolute inset-0 h-full w-full object-contain" />
          </div>
        </figure>
      </div> : null}

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
          <dt className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.canvas.changedChunks')}</dt>
          <dd className="font-semibold text-[var(--text)]">{formatNumber(changedChunks, locale, missing)}</dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
          <dt className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.canvas.coresSummary')}</dt>
          <dd className="font-semibold text-[var(--text)]">{formatNumber(counts?.cores?.before, locale, missing)} → {formatNumber(counts?.cores?.after, locale, missing)}</dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
          <dt className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.canvas.spawnsSummary')}</dt>
          <dd className="font-semibold text-[var(--text)]">{formatNumber(counts?.spawns?.before, locale, missing)} → {formatNumber(counts?.spawns?.after, locale, missing)}</dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
          <dt className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.objects.buildings')}</dt>
          <dd className="font-semibold text-[var(--text)]">{formatNumber(counts?.buildings?.before, locale, missing)} → {formatNumber(counts?.buildings?.after, locale, missing)}</dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
          <dt className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.canvas.resourceSummary')}</dt>
          <dd className="font-semibold text-[var(--text)]">{formatNumber(resources.length, locale, missing)}</dd>
        </div>
      </dl>
      {diff.chunks_truncated ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.canvas.chunksTruncated')}</p> : null}

      <section className="min-w-0 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-3">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.chunk.title')}</h4>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            <span>{t('visualDiff.map.chunk.cx')}</span>
            <input
              type="number"
              min={0}
              max={1000000}
              value={chunkX}
              disabled={chunkMetadataOnly}
              onChange={(event) => setChunkX(event.target.value)}
              className="min-h-11 w-28 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            <span>{t('visualDiff.map.chunk.cy')}</span>
            <input
              type="number"
              min={0}
              max={1000000}
              value={chunkY}
              disabled={chunkMetadataOnly}
              onChange={(event) => setChunkY(event.target.value)}
              className="min-h-11 w-28 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            onClick={loadChunk}
            disabled={chunkLoading || chunkMetadataOnly}
            className="min-h-11 rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary-text)] disabled:opacity-60"
          >
            {chunkLoading ? t('visualDiff.map.chunk.loading') : t('visualDiff.map.chunk.load')}
          </button>
        </div>
        {chunkError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('visualDiff.map.chunk.error')}</p> : null}
        {chunkResponse?.status === 'metadata_only' ? <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.map.chunk.metadataOnly')}</p> : null}
        {chunkResponse?.status === 'unavailable' ? <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.map.chunk.unavailable')}</p> : null}
        {chunkResponse?.status === 'computing' ? <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.map.chunk.computing')}</p> : null}
        {chunkResponse?.status === 'ready' ? (chunkResponse.chunk
          ? <pre className="max-h-64 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs leading-5 text-[var(--text-secondary)]">{chunkText(chunkResponse.chunk)}</pre>
          : <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.map.chunk.empty')}</p>) : null}
      </section>
    </div> : null}

    {tab === 'rules' ? <div role="tabpanel" id={tabPanelId('rules')} aria-labelledby={tabButtonId('rules')} className="space-y-4">
      {rules?.unknown_rules_changed ? <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">{t('visualDiff.map.rules.unknownChanged')}</p> : null}
      {!hasRules ? <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.map.rules.empty')}</p> : null}
      {ruleAdded.length ? <section className="min-w-0 space-y-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.rules.addedTitle')}</h4>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[26rem] text-sm">
            <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]"><tr><th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.rules.key')}</th><th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.rules.value')}</th></tr></thead>
            <tbody>{ruleAdded.map((entry, index) => <tr key={`added:${entry.key ?? index}`} className="border-t border-[var(--border)]">
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text)]">{entry.key ?? missing}</td>
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{safeJsonText(entry.value, missing)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section> : null}
      {ruleRemoved.length ? <section className="min-w-0 space-y-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.rules.removedTitle')}</h4>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[26rem] text-sm">
            <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]"><tr><th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.rules.key')}</th><th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.rules.value')}</th></tr></thead>
            <tbody>{ruleRemoved.map((entry, index) => <tr key={`removed:${entry.key ?? index}`} className="border-t border-[var(--border)]">
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text)]">{entry.key ?? missing}</td>
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{safeJsonText(entry.value, missing)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section> : null}
      {ruleChanged.length ? <section className="min-w-0 space-y-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.rules.changedTitle')}</h4>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]"><tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.rules.key')}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.rules.before')}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.rules.after')}</th>
            </tr></thead>
            <tbody>{ruleChanged.map((entry, index) => <tr key={`changed:${entry.key ?? index}`} className="border-t border-[var(--border)]">
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text)]">{entry.key ?? missing}</td>
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{safeJsonText(entry.before, missing)}</td>
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{safeJsonText(entry.after, missing)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section> : null}
      {bannedBlocks?.added?.length || bannedBlocks?.removed?.length ? <section className="space-y-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.rules.bannedBlocks')}</h4>
        <div className="flex flex-wrap gap-1">{bannedBlocks?.added?.map((name) => <span key={`bb-add:${name}`} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">{name}</span>)}</div>
        <div className="flex flex-wrap gap-1">{bannedBlocks?.removed?.map((name) => <span key={`bb-remove:${name}`} className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">{name}</span>)}</div>
      </section> : null}
      {bannedUnits?.added?.length || bannedUnits?.removed?.length ? <section className="space-y-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.rules.bannedUnits')}</h4>
        <div className="flex flex-wrap gap-1">{bannedUnits?.added?.map((name) => <span key={`bu-add:${name}`} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">{name}</span>)}</div>
        <div className="flex flex-wrap gap-1">{bannedUnits?.removed?.map((name) => <span key={`bu-remove:${name}`} className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">{name}</span>)}</div>
      </section> : null}
      {loadout?.added?.length || loadout?.removed?.length ? <section className="space-y-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.rules.loadout')}</h4>
        <p className="break-all font-mono text-xs text-[var(--text-secondary)]">{t('visualDiff.map.rules.addedTitle')}: {loadout?.added?.map((value) => safeJsonText(value, missing)).join(', ') || t('visualDiff.map.rules.none')}</p>
        <p className="break-all font-mono text-xs text-[var(--text-secondary)]">{t('visualDiff.map.rules.removedTitle')}: {loadout?.removed?.map((value) => safeJsonText(value, missing)).join(', ') || t('visualDiff.map.rules.none')}</p>
      </section> : null}
    </div> : null}

    {tab === 'waves' ? <div role="tabpanel" id={tabPanelId('waves')} aria-labelledby={tabButtonId('waves')} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
        <span className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.waves.title')}</span>
        {(['beforeHealth', 'afterHealth', 'beforeStrength', 'afterStrength'] as const).map((key) => <label key={key} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={visibleSeries[key]}
            onChange={() => setVisibleSeries((current) => ({ ...current, [key]: !current[key] }))}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[key] }} aria-hidden="true" />
          {seriesLabels[key]}
        </label>)}
      </div>
      <WaveChart
        title={t('visualDiff.map.waves.healthTitle')}
        ariaLabel={t('visualDiff.map.waves.healthTitle')}
        series={healthSeries}
        allEmpty={healthEmpty}
      />
      <WaveChart
        title={t('visualDiff.map.waves.strengthTitle')}
        ariaLabel={t('visualDiff.map.waves.strengthTitle')}
        series={strengthSeries}
        allEmpty={strengthEmpty}
      />
      {waveGroups ? <div className="space-y-1 text-sm text-[var(--text-secondary)]">
        <p className="font-semibold text-[var(--text)]">{t('visualDiff.map.waves.groupsTitle')}</p>
        <p>{t('visualDiff.map.waves.groupsAdded')}: {formatNumber(waveGroups.added?.length ?? 0, locale, missing)} · {t('visualDiff.map.waves.groupsRemoved')}: {formatNumber(waveGroups.removed?.length ?? 0, locale, missing)} · {t('visualDiff.map.waves.groupsChanged')}: {formatNumber(waveGroups.changed?.length ?? 0, locale, missing)}</p>
        {waveGroups.truncated ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.waves.groupsTruncated')}</p> : null}
      </div> : null}
      {waveCount ? <p className="text-sm text-[var(--text-secondary)]">{t('visualDiff.map.waves.waveCount')}: {formatNumber(finiteNumber(waveCount.before), locale, missing)} → {formatNumber(finiteNumber(waveCount.after), locale, missing)}</p> : null}
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="px-3 py-2 text-left text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.waves.tableTitle')}</caption>
          <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]"><tr>
            <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.waves.tableWave')}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.waves.tableHealthBefore')}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.waves.tableHealthAfter')}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.waves.tableStrengthBefore')}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.waves.tableStrengthAfter')}</th>
          </tr></thead>
          <tbody>
            {waveRows.length ? waveRows.map((row) => <tr key={row.wave} className="border-t border-[var(--border)]">
              <td className="px-3 py-2 font-mono text-xs text-[var(--text)]">{row.wave}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(row.healthBefore, locale, missing)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(row.healthAfter, locale, missing)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(row.strengthBefore, locale, missing)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(row.strengthAfter, locale, missing)}</td>
            </tr>) : <tr><td colSpan={5} className="px-3 py-3 text-sm text-[var(--text-muted)]">{t('visualDiff.map.waves.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div> : null}

    {tab === 'objects' ? <div role="tabpanel" id={tabPanelId('objects')} aria-labelledby={tabButtonId('objects')} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.objects.title')}</h4>
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary-text)]">{t('visualDiff.estimated')}</span>
      </div>
      {!objectCount && !resources.length && !chunks.length ? <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.map.objects.empty')}</p> : null}
      {objectCount ? <section className="min-w-0 space-y-2">
        <h5 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.objects.countsTitle')}</h5>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[24rem] text-sm">
            <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]"><tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.objects.title')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.objects.before')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.objects.after')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.objects.delta')}</th>
            </tr></thead>
            <tbody>{countRows.filter((row) => row.pair).map((row) => <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="px-3 py-2 text-[var(--text)]">{row.label}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(finiteNumber(row.pair?.before), locale, missing)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(finiteNumber(row.pair?.after), locale, missing)}</td>
              <td className="px-3 py-2 text-right text-[var(--text)]">{formatNumber(deltaOf(row.pair), locale, missing)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {diff.objects_truncated ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.objects.objectsTruncated')}</p> : null}
      </section> : null}

      <section className="min-w-0 space-y-2">
        <h5 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.objects.resourcesTitle')}</h5>
        {resources.length ? <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-muted)]"><tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.objects.resourceName')}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t('visualDiff.map.objects.resourceKind')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.objects.resourceBeforeTiles')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.objects.resourceAfterTiles')}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t('visualDiff.map.objects.resourceDelta')}</th>
            </tr></thead>
            <tbody>{resources.map((resource: MapResourceDelta, index) => <tr key={`${resource.name ?? 'resource'}:${index}`} className="border-t border-[var(--border)]">
              <td className="break-all px-3 py-2 font-mono text-xs text-[var(--text)]">{resource.name ?? missing}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{resourceKindLabel(resource.kind)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(finiteNumber(resource.before_tiles), locale, missing)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{formatNumber(finiteNumber(resource.after_tiles), locale, missing)}</td>
              <td className="px-3 py-2 text-right text-[var(--text)]">{formatNumber(finiteNumber(resource.delta), locale, missing)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.map.objects.resourcesEmpty')}</p>}
      </section>

      <section className="min-w-0 space-y-2">
        <h5 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.map.objects.terrainTitle')}</h5>
        {chunks.length ? <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {chunks.slice(0, 20).map((chunk, index) => <li key={`${chunk.cx}:${chunk.cy}:${index}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-[var(--text)]">({finiteNumber(chunk.cx) ?? 0}, {finiteNumber(chunk.cy) ?? 0})</span>
            <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{t('visualDiff.map.objects.terrainFloor')}: {chunk.floor_changed ? t('visualDiff.changed') : t('visualDiff.unchanged')}</span>
            <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{t('visualDiff.map.objects.terrainOverlay')}: {chunk.overlay_changed ? t('visualDiff.changed') : t('visualDiff.unchanged')}</span>
          </li>)}
        </ul> : <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{t('visualDiff.map.objects.terrainEmpty')}</p>}
        {diff.chunks_truncated || chunks.length > 20 ? <p className="text-xs text-[var(--text-muted)]">{t('visualDiff.map.objects.terrainTruncated')}</p> : null}
      </section>
    </div> : null}
  </section>;
}
