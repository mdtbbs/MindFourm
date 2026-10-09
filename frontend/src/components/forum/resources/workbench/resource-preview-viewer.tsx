'use client';

import { useMemo, useRef, useState } from 'react';
import { Crosshair, Grid2X2, Minus, Plus, RotateCcw } from 'lucide-react';
import { getPreviewMarkers } from './resource-preview-geometry';

export type ResourcePreviewViewerLabels = {
  zoomIn: string;
  zoomOut: string;
  reset: string;
  coordinates: string;
  approximate: string;
  grid: string;
  markers: string;
  noMarkers: string;
  noPreview: string;
  status: Record<string, string>;
  inspect: string;
  selected: string;
  layersTitle: string;
  layersNote: string;
  layersTruncated: string;
  layers: Record<'logistics' | 'liquid' | 'power' | 'input_output' | 'terrain' | 'resources' | 'ores' | 'cores' | 'enemy_spawns' | 'buildings' | 'player_area', string>;
  wave: {
    title: string;
    chart: string;
    range: string;
    enemies: string;
    health: string;
    airRatio: string;
    bosses: string;
    strength: string;
    spike: string;
    openEnded: string;
    estimated: string;
    empty: string;
    unknown: string;
  };
};

export type ResourcePreviewWave = {
  wave_start: number;
  wave_end: number | null;
  enemy_count: number | null;
  estimated_health: number | null;
  air_ratio: number | null;
  boss_count: number;
  strength: number | null;
  is_spike: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeResourcePreviewWaves(value: unknown): ResourcePreviewWave[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).flatMap((item): ResourcePreviewWave[] => {
    const row = record(item);
    if (!row) return [];
    const start = finite(row.wave_start ?? row.begin);
    const end = finite(row.wave_end ?? row.end ?? row.begin);
    if (start === null || end === null || end < start) return [];
    const amount = finite(row.amount ?? row.enemy_count);
    const spacing = Math.max(1, Math.floor(finite(row.spacing) ?? 1));
    const waveCount = end > 1_000_000 ? 1 : Math.floor((end - start) / spacing) + 1;
    const enemyCount = finite(row.enemy_count) ?? (amount === null ? null : amount * waveCount);
    const unitHealth = finite(row.unit_health ?? row.health);
    const shields = Math.max(0, finite(row.shields) ?? 0);
    const health = finite(row.estimated_health) ?? (enemyCount === null || unitHealth === null ? null : enemyCount * (unitHealth + shields));
    const air = finite(row.air_ratio) ?? (typeof row.flying === 'boolean' ? (row.flying ? 1 : 0) : null);
    const bosses = finite(row.boss_count);
    return [{
      wave_start: start,
      wave_end: end > 1_000_000 ? null : end,
      enemy_count: enemyCount,
      estimated_health: health,
      air_ratio: air === null ? null : Math.min(1, Math.max(0, air)),
      boss_count: bosses === null ? (row.boss === true || row.is_boss === true ? enemyCount ?? 1 : 0) : Math.max(0, Math.floor(bosses)),
      strength: finite(row.strength) ?? enemyCount,
      is_spike: row.is_spike === true || row.spike === true,
    }];
  });
}

const SCHEMATIC_LAYERS = ['logistics', 'liquid', 'power', 'input_output'] as const;
const MAP_LAYERS = ['terrain', 'resources', 'ores', 'cores', 'enemy_spawns', 'buildings', 'player_area', 'liquid'] as const;
type VisibleLayerKey = keyof ResourcePreviewViewerLabels['layers'];
const MAX_VISIBLE_MAP_MARKERS = 1_500;

export default function ResourcePreviewViewer({
  title,
  kind,
  imageUrl,
  status,
  metadata,
  width,
  height,
  waveData,
  labels,
}: {
  title: string;
  kind: string;
  imageUrl: string | null;
  status: string;
  metadata: unknown;
  width: number | null;
  height: number | null;
  waveData?: unknown;
  labels: ResourcePreviewViewerLabels;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [gridVisible, setGridVisible] = useState(false);
  const [markersVisible, setMarkersVisible] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState<Record<VisibleLayerKey, boolean>>({
    logistics: true, liquid: true, power: true, input_output: true,
    terrain: false, resources: false, ores: false, cores: true,
    enemy_spawns: true, buildings: false, player_area: false,
  });
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const markers = useMemo(() => getPreviewMarkers(kind, metadata, width, height), [height, kind, metadata, width]);
  const imageFrame = useMemo(() => {
    if (!naturalSize) return { left: 0, top: 0, width: 100, height: 100 };
    const stageRatio = 16 / 9;
    const imageRatio = naturalSize.width / naturalSize.height;
    if (imageRatio >= stageRatio) {
      const frameHeight = (stageRatio / imageRatio) * 100;
      return { left: 0, top: (100 - frameHeight) / 2, width: 100, height: frameHeight };
    }
    const frameWidth = (imageRatio / stageRatio) * 100;
    return { left: (100 - frameWidth) / 2, top: 0, width: frameWidth, height: 100 };
  }, [naturalSize]);

  const updateCursor = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || !width || !height) {
      setCursor(null);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const localX = (event.clientX - rect.left - offset.x - rect.width / 2) / scale + rect.width / 2;
    const localY = (event.clientY - rect.top - offset.y - rect.height / 2) / scale + rect.height / 2;
    const frameLeft = rect.width * imageFrame.left / 100;
    const frameTop = rect.height * imageFrame.top / 100;
    const frameWidth = rect.width * imageFrame.width / 100;
    const frameHeight = rect.height * imageFrame.height / 100;
    const xRatio = (localX - frameLeft) / frameWidth;
    const yRatio = (localY - frameTop) / frameHeight;
    if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) {
      setCursor(null);
      return;
    }
    setCursor({
      x: Math.min(width - 1, Math.max(0, Math.floor(xRatio * width))),
      y: Math.min(height - 1, Math.max(0, Math.floor((1 - yRatio) * height))),
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      setOffset({ x: drag.offsetX + event.clientX - drag.x, y: drag.offsetY + event.clientY - drag.y });
    }
    updateCursor(event);
  };

  const zoomBy = (amount: number) => setScale((value) => Math.min(4, Math.max(0.5, Number((value + amount).toFixed(2)))));
  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };
  const stageStatus = labels.status[status] || status;
  const waves = useMemo(() => normalizeResourcePreviewWaves(waveData), [waveData]);
  const allVisibleMarkers = markers.filter((marker) => marker.layer === 'other' || visibleLayers[marker.layer]);
  const visibleMarkerLimitReached = kind === 'map' && allVisibleMarkers.length > MAX_VISIBLE_MAP_MARKERS;
  const visibleMarkers = visibleMarkerLimitReached ? allVisibleMarkers.slice(0, MAX_VISIBLE_MAP_MARKERS) : allVisibleMarkers;
  const maxStrength = waves.reduce((maximum, wave) => Math.max(maximum, wave.strength || 0), 0);
  const metadataRoot = record(metadata);
  const mapMetadata = record(metadataRoot?.map) ?? metadataRoot;
  const tileLayersTruncated = mapMetadata?.tile_layers_truncated === true;

  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-[var(--text)]">{title}</h3>
          <p className="text-xs text-[var(--text-muted)]">{stageStatus}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" aria-label={labels.zoomOut} title={labels.zoomOut} disabled={!imageUrl || scale <= 0.5} onClick={() => zoomBy(-0.25)} className="inline-flex h-10 w-10 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-40"><Minus className="h-4 w-4" /></button>
          <span className="min-w-12 text-center text-xs tabular-nums text-[var(--text-muted)]">{Math.round(scale * 100)}%</span>
          <button type="button" aria-label={labels.zoomIn} title={labels.zoomIn} disabled={!imageUrl || scale >= 4} onClick={() => zoomBy(0.25)} className="inline-flex h-10 w-10 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label={labels.reset} title={labels.reset} disabled={!imageUrl} onClick={reset} className="inline-flex h-10 w-10 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-40"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>

      {imageUrl ? (
        <>
          <div
            ref={stageRef}
            className="relative aspect-video touch-none overflow-hidden bg-[var(--bg-elevated)]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; updateCursor(event); }}
            onPointerCancel={() => { dragRef.current = null; }}
            onPointerLeave={() => setCursor(null)}
            onWheel={(event) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 0.1 : -0.1); }}
          >
            <div className="absolute inset-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center' }}>
              <img
                src={imageUrl}
                alt={title}
                draggable={false}
                onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                className="h-full w-full select-none object-contain"
              />
              {gridVisible && <div aria-hidden="true" className="pointer-events-none absolute border border-white/30" style={{ left: `${imageFrame.left}%`, top: `${imageFrame.top}%`, width: `${imageFrame.width}%`, height: `${imageFrame.height}%`, backgroundImage: 'linear-gradient(to right, rgb(255 255 255 / 24%) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 24%) 1px, transparent 1px)', backgroundSize: '8% 8%' }} />}
              {markersVisible && visibleMarkers.map((marker, index) => (
                <button key={`${marker.label}:${index}`} type="button" title={marker.label} aria-label={`${labels.inspect}: ${marker.label}`} aria-pressed={selectedMarker === marker.label} onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedMarker(marker.label)} className={`pointer-events-auto absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${selectedMarker === marker.label ? 'scale-125 bg-amber-400' : 'bg-[var(--primary)]'}`} style={{ left: `${imageFrame.left + marker.xPercent * imageFrame.width / 100}%`, top: `${imageFrame.top + marker.yPercent * imageFrame.height / 100}%` }} />
              ))}
            </div>
            {cursor && width && height && <output className="pointer-events-none absolute bottom-2 left-2 z-20 rounded bg-black/75 px-2 py-1 font-mono text-xs text-white">{cursor.x}, {cursor.y}</output>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
            <p className="inline-flex items-center gap-1"><Crosshair className="h-3.5 w-3.5" />{labels.coordinates}: {width && height ? `${width} × ${height} · ${labels.approximate}` : labels.noMarkers}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={gridVisible} onClick={() => setGridVisible((value) => !value)} className="inline-flex min-h-9 items-center gap-1 rounded border border-[var(--border)] px-2 hover:text-[var(--primary-text)]"><Grid2X2 className="h-3.5 w-3.5" />{labels.grid}</button>
              <button type="button" aria-pressed={markersVisible} disabled={markers.length === 0} onClick={() => setMarkersVisible((value) => !value)} className="inline-flex min-h-9 items-center gap-1 rounded border border-[var(--border)] px-2 hover:text-[var(--primary-text)] disabled:opacity-40"><Crosshair className="h-3.5 w-3.5" />{labels.markers}{markers.length === 0 ? ` · ${labels.noMarkers}` : ` · ${markers.length}`}</button>
            </div>
          </div>
          {(kind === 'schematic' || kind === 'map') && <fieldset className="border-t border-[var(--border)] p-3">
            <legend className="px-1 text-xs font-semibold text-[var(--text-secondary)]">{labels.layersTitle}</legend>
            <div className="flex flex-wrap gap-2">
              {(kind === 'map' ? MAP_LAYERS : SCHEMATIC_LAYERS).map((layer) => <label key={layer} className="inline-flex min-h-9 items-center gap-2 rounded border border-[var(--border)] px-2 text-xs text-[var(--text-secondary)]">
                <input type="checkbox" checked={visibleLayers[layer]} disabled={!markers.some((marker) => marker.layer === layer)} onChange={(event) => setVisibleLayers((current) => ({ ...current, [layer]: event.target.checked }))} />{labels.layers[layer]}
              </label>)}
            </div>
            {kind === 'schematic' && <p className="mt-2 text-xs text-[var(--text-muted)]">{labels.layersNote}</p>}
            {kind === 'map' && (tileLayersTruncated || visibleMarkerLimitReached) && <p className="mt-2 text-xs text-[var(--text-muted)]">{labels.layersTruncated}</p>}
          </fieldset>}
          {selectedMarker && <p className="border-t border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"><span className="font-semibold">{labels.selected}:</span> {selectedMarker}</p>}
        </>
      ) : (
        <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">{labels.noPreview}</div>
      )}
      {kind === 'map' && <section aria-label={labels.wave.title} className="border-t border-[var(--border)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-[var(--text)]">{labels.wave.title}</h4><span className="rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-muted)]">{labels.wave.estimated}</span></div>
        {waves.length === 0 ? <p className="mt-3 text-sm text-[var(--text-muted)]">{labels.wave.empty}</p> : <>
          <div role="img" aria-label={labels.wave.chart} className="mt-3 flex h-24 items-end gap-1 overflow-x-auto rounded bg-[var(--bg-elevated)] p-2">
            {waves.map((wave, index) => <div key={`${wave.wave_start}:${wave.wave_end}:${index}`} title={`${labels.wave.range}: ${wave.wave_start}–${wave.wave_end ?? labels.wave.openEnded}; ${labels.wave.strength}: ${wave.strength ?? labels.wave.unknown}`} className={`min-w-2 flex-1 rounded-t ${wave.is_spike ? 'bg-amber-500' : 'bg-[var(--primary)]'}`} style={{ height: `${maxStrength > 0 && wave.strength !== null ? Math.max(4, Math.round(wave.strength / maxStrength * 100)) : 4}%` }} />)}
          </div>
          <ol className="mt-3 max-h-64 space-y-2 overflow-auto">
            {waves.map((wave, index) => <li key={`${wave.wave_start}:${wave.wave_end}:${index}`} className="rounded-lg border border-[var(--border)] p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-[var(--text)]"><span>{labels.wave.range}: {wave.wave_start}–{wave.wave_end ?? labels.wave.openEnded}</span>{wave.boss_count > 0 && <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300">{labels.wave.bosses}: {wave.boss_count}</span>}{wave.is_spike && <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">{labels.wave.spike}</span>}</div>
              <p className="mt-2 text-[var(--text-secondary)]">{labels.wave.enemies}: {wave.enemy_count ?? labels.wave.unknown} · {labels.wave.health}: {wave.estimated_health ?? labels.wave.unknown} · {labels.wave.airRatio}: {wave.air_ratio === null ? labels.wave.unknown : `${Math.round(wave.air_ratio * 100)}%`} · {labels.wave.strength}: {wave.strength ?? labels.wave.unknown}</p>
            </li>)}
          </ol>
        </>}
      </section>}
    </section>
  );
}
