'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FlipHorizontal, Move, RotateCcw, RotateCw, Save, Search, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import {
  analyzeResourceWorkbenchVersionV2,
  exportResourceWorkbenchSchematicV2,
  getResourceV2SchematicBlocks,
  createResourceDirectVersionDraft,
  uploadResourceDirectDraft,
  type ResourceV2SchematicBlock,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
  type ResourceWorkbenchV2VersionAnalysis,
} from '@/lib/api/v1/resources';
import { fetchV1, V1ApiError } from '@/lib/api/v1/transport';
import { useI18n } from '@/i18n/provider';

type LogicLink = { name: string; x: number; y: number };
type Placement = {
  key: string;
  sourceKey?: string;
  x: number;
  y: number;
  rotation: number;
  size: number;
  block: string;
  displayName: string;
  logicSource?: string;
  logicLinks?: LogicLink[];
};
type BlockGroup = { name: string; displayName: string | null; count: number; placements: Placement[]; size: number };
type SchematicMove = { from_x: number; from_y: number; to_x: number; to_y: number };
type SchematicAddition = { x: number; y: number; block: string; rotation: number; previewSize: number };
type EditSnapshot = {
  deleted: string[];
  moves: SchematicMove[];
  additions: SchematicAddition[];
  logicEdits: Record<string, string>;
  rotation: number;
  mirrorX: boolean;
};
type Dimensions = { width: number; height: number };

type Tool = 'select' | 'move' | 'place';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `schematic-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readDimensions(value: unknown): Dimensions | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detail = value as Record<string, unknown>;
  const width = detail.width; const height = detail.height;
  return Number.isInteger(width) && Number.isInteger(height) && (width as number) > 0 && (height as number) > 0
    && (width as number) <= 128 && (height as number) <= 128 ? { width: width as number, height: height as number } : null;
}

function makeGroups(blocks: ResourceV2SchematicBlock[]) {
  let complete = blocks.length > 0;
  let total = 0;
  const groups = blocks.map((block): BlockGroup => {
    const positions = Array.isArray(block.positions) ? block.positions : [];
    const placements = positions.flatMap((position): Placement[] => {
      if (!Number.isInteger(position.x) || !Number.isInteger(position.y)) return [];
      const config = position.config && typeof position.config === 'object' && !Array.isArray(position.config) ? position.config as Record<string, unknown> : null;
      const source = config?.format_version === 1 && typeof config.source === 'string' && position.logic_source_available === true ? config.source : undefined;
      const links = config?.format_version === 1 && Array.isArray(config.links) ? config.links.flatMap((raw): LogicLink[] => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
        const link = raw as Record<string, unknown>;
        return typeof link.name === 'string' && Number.isInteger(link.x) && Number.isInteger(link.y) ? [{ name: link.name, x: link.x as number, y: link.y as number }] : [];
      }) : undefined;
      const size = Number.isInteger(position.size) && Number(position.size) > 0 ? Math.min(16, Number(position.size)) : 1;
      return [{ key: `${position.x}:${position.y}`, sourceKey: `${position.x}:${position.y}`, x: position.x as number, y: position.y as number,
        rotation: Number.isInteger(position.rotation) ? Number(position.rotation) & 3 : 0, size, block: block.internal_name,
        displayName: block.display_name || block.internal_name, ...(source !== undefined ? { logicSource: source } : {}), ...(links ? { logicLinks: links } : {}) }];
    });
    if (placements.length !== block.count || placements.length !== positions.length) complete = false;
    total += placements.length;
    return { name: block.internal_name, displayName: block.display_name, count: block.count, placements, size: placements[0]?.size || 1 };
  }).sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name));
  if (total > 10_000) complete = false;
  return { groups, complete, total };
}

function suggestedFilename(version: ResourceWorkbenchV2Version) {
  const sourceName = version.files.find((file) => file.role === 'primary')?.original_filename || version.files[0]?.original_filename || 'schematic.msch';
  return `${sourceName.split(/[\\/]/).pop()?.replace(/\.msch$/i, '') || 'schematic'}-edited.msch`;
}

function footprint(placement: Pick<Placement, 'x' | 'y' | 'size'>) {
  const offset = -Math.floor((placement.size - 1) / 2);
  return { left: placement.x + offset, bottom: placement.y + offset, right: placement.x + offset + placement.size, top: placement.y + offset + placement.size };
}

export default function SchematicLightEditor({ workbench, version, canEdit, onSaved }: {
  workbench: ResourceWorkbenchV2Response;
  version: ResourceWorkbenchV2Version | null;
  canEdit: boolean;
  onSaved?: (versionPublicId: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<BlockGroup[]>([]);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [complete, setComplete] = useState(false);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState<SchematicMove[]>([]);
  const [additions, setAdditions] = useState<SchematicAddition[]>([]);
  const [logicEdits, setLogicEdits] = useState<Record<string, string>>({});
  const [tool, setTool] = useState<Tool>('select');
  const [moveAnchor, setMoveAnchor] = useState<string | null>(null);
  const [paletteBlock, setPaletteBlock] = useState('');
  const [paletteSearch, setPaletteSearch] = useState('');
  const [customBlock, setCustomBlock] = useState('');
  const [customSize, setCustomSize] = useState(1);
  const [placementRotation, setPlacementRotation] = useState(0);
  const [zoom, setZoom] = useState(18);
  const [undoStack, setUndoStack] = useState<EditSnapshot[]>([]);
  const [rotation, setRotation] = useState(0);
  const [mirrorX, setMirrorX] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [analysis, setAnalysis] = useState<ResourceWorkbenchV2VersionAnalysis | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionSaved, setVersionSaved] = useState(false);
  const saveAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const versionPublicId = version?.public_id;
  const versionStatus = version?.status;

  useEffect(() => {
    setGroups([]); setDimensions(null); setSelected(new Set()); setDeleted(new Set()); setMoves([]); setAdditions([]); setLogicEdits({}); setUndoStack([]);
    setTool('select'); setMoveAnchor(null); setPaletteBlock(''); setRotation(0); setMirrorX(false); setPlacementRotation(0);
    setAnalysis(null); setDownloaded(false); setVersionSaved(false); setActionError(''); setLoadError(''); saveAttempt.current = null;
    if (!canEdit || !versionPublicId || versionStatus !== 'published') { setComplete(false); setTotal(0); return; }
    let active = true; setLoading(true);
    void (async () => {
      const query = new URLSearchParams({ version_public_id: versionPublicId });
      const detail = await fetchV1<{ version_public_id: string | null; schematic?: Record<string, unknown> | null }>(`/resources/schematics/${encodeURIComponent(workbench.resource.public_id)}?${query.toString()}`);
      const selectedDimensions = readDimensions(detail.schematic);
      if (!selectedDimensions || detail.version_public_id !== versionPublicId) throw new Error(t('resourceWorkbenchV2.schematicEditor.loadFailed'));
      const blocks: ResourceV2SchematicBlock[] = [];
      let cursor: string | undefined; let pages = 0;
      do {
        const page = await getResourceV2SchematicBlocks(workbench.resource.public_id, versionPublicId, { limit: 100, cursor });
        blocks.push(...page.items); cursor = page.pagination.has_more ? page.pagination.next_cursor || undefined : undefined; pages += 1;
      } while (cursor && pages < 10);
      const normalized = makeGroups(blocks);
      if (!active) return;
      setDimensions(selectedDimensions); setGroups(normalized.groups); setPaletteBlock(normalized.groups[0]?.name || '');
      setComplete(normalized.complete && !cursor); setTotal(normalized.total);
    })().catch((caught) => { if (active) setLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.schematicEditor.loadFailed')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canEdit, t, versionPublicId, versionStatus, workbench.resource.public_id]);

  const paletteGroups = useMemo(() => groups.filter((group) => !paletteSearch.trim() || `${group.displayName || ''} ${group.name}`.toLowerCase().includes(paletteSearch.trim().toLowerCase())), [groups, paletteSearch]);
  const moveBySource = useMemo(() => new Map(moves.map((move) => [`${move.from_x}:${move.from_y}`, move])), [moves]);
  const visiblePlacements = useMemo(() => {
    const result: Placement[] = [];
    for (const group of groups) for (const placement of group.placements) {
      if (deleted.has(placement.key)) continue;
      const move = moveBySource.get(placement.key);
      result.push(move ? { ...placement, x: move.to_x, y: move.to_y } : placement);
    }
    for (const item of additions) result.push({ key: `added:${item.x}:${item.y}:${item.block}:${item.rotation}`, x: item.x, y: item.y, rotation: item.rotation, size: item.previewSize, block: item.block, displayName: item.block });
    return result;
  }, [additions, deleted, groups, moveBySource]);

  const logicConfigEdits = useMemo(() => groups.flatMap((group) => group.placements.flatMap((placement) => {
    const source = logicEdits[placement.key];
    return source !== undefined && source !== placement.logicSource ? [{ x: placement.x, y: placement.y, source }] : [];
  })), [groups, logicEdits]);
  const hasEdits = rotation !== 0 || mirrorX || deleted.size > 0 || moves.length > 0 || additions.length > 0 || logicConfigEdits.length > 0;
  const canExport = Boolean(canEdit && version?.status === 'published' && complete && !loading && !busy && hasEdits);
  const selectedPlacements = useMemo(() => visiblePlacements.filter((placement) => selected.has(placement.key)), [selected, visiblePlacements]);
  const selectedLogicPlacement = selectedPlacements.find((placement) => placement.logicSource !== undefined && !placement.key.startsWith('added:'));

  const rememberEdit = () => setUndoStack((current) => [...current.slice(-49), {
    deleted: [...deleted], moves: [...moves], additions: additions.map((item) => ({ ...item })), logicEdits: { ...logicEdits }, rotation, mirrorX,
  }]);
  const invalidatePreview = () => { setAnalysis(null); setDownloaded(false); setVersionSaved(false); setActionError(''); };

  const undoLast = () => {
    const previous = undoStack[undoStack.length - 1]; if (!previous) return;
    setUndoStack((current) => current.slice(0, -1)); setDeleted(new Set(previous.deleted)); setMoves(previous.moves);
    setAdditions(previous.additions); setLogicEdits(previous.logicEdits); setRotation(previous.rotation); setMirrorX(previous.mirrorX);
    setSelected(new Set()); setMoveAnchor(null); invalidatePreview();
  };

  const occupantAt = (x: number, y: number) => visiblePlacements.find((placement) => {
    const box = footprint(placement); return x >= box.left && x < box.right && y >= box.bottom && y < box.top;
  });

  const handleCell = (x: number, y: number, additive = false) => {
    const occupant = occupantAt(x, y);
    if (tool === 'select') {
      if (!occupant) { if (!additive) setSelected(new Set()); return; }
      if (additive) setSelected((current) => { const next = new Set(current); if (next.has(occupant.key)) next.delete(occupant.key); else next.add(occupant.key); return next; });
      else setSelected(new Set([occupant.key]));
      return;
    }
    if (tool === 'move') {
      if (!moveAnchor) {
        if (!occupant || occupant.key.startsWith('added:')) return;
        const nextSelection = selected.has(occupant.key) ? selected : new Set([occupant.key]);
        setSelected(nextSelection); setMoveAnchor(occupant.key); return;
      }
      const anchor = visiblePlacements.find((placement) => placement.key === moveAnchor);
      if (!anchor || occupant) return;
      const dx = x - anchor.x; const dy = y - anchor.y;
      const sources = selectedPlacements.filter((placement) => !placement.key.startsWith('added:'));
      rememberEdit();
      setMoves((current) => {
        const movingKeys = new Set(sources.map((placement) => placement.sourceKey || placement.key));
        const retained = current.filter((move) => !movingKeys.has(`${move.from_x}:${move.from_y}`));
        return [...retained, ...sources.map((placement) => {
          const [from_x, from_y] = (placement.sourceKey || placement.key).split(':').map(Number);
          return { from_x, from_y, to_x: placement.x + dx, to_y: placement.y + dy };
        })];
      });
      setMoveAnchor(null); setSelected(new Set()); invalidatePreview(); return;
    }
    if (tool === 'place' && !occupant) {
      const known = groups.find((group) => group.name === paletteBlock);
      const block = customBlock.trim() || known?.name || paletteBlock;
      const previewSize = customBlock.trim() ? Math.max(1, Math.min(16, customSize)) : known?.size || 1;
      if (!block) return;
      const box = footprint({ x, y, size: previewSize });
      if (!dimensions || box.left < 0 || box.bottom < 0 || box.right > dimensions.width || box.top > dimensions.height) return;
      rememberEdit(); setAdditions((current) => [...current, { x, y, block, rotation: placementRotation, previewSize }]); invalidatePreview();
    }
  };

  const deleteSelected = () => {
    if (!selected.size) return; rememberEdit();
    const addedKeys = new Set([...selected].filter((key) => key.startsWith('added:')));
    const sourceKeys = [...selected].filter((key) => !key.startsWith('added:'));
    setDeleted((current) => new Set([...current, ...sourceKeys]));
    setAdditions((current) => current.filter((item) => !addedKeys.has(`added:${item.x}:${item.y}:${item.block}:${item.rotation}`)));
    setSelected(new Set()); invalidatePreview();
  };

  const selectSameType = () => {
    const first = selectedPlacements[0]; if (!first) return;
    setSelected(new Set(visiblePlacements.filter((placement) => placement.block === first.block && !placement.key.startsWith('added:')).map((placement) => placement.key)));
  };

  const transformPayload = () => ({
    rotation_quarters: rotation,
    mirror_x: mirrorX,
    delete_positions: [...deleted].map((key) => { const [x, y] = key.split(':').map(Number); return { x, y }; }),
    move_positions: moves,
    add_blocks: additions.map(({ x, y, block, rotation: itemRotation }) => ({ x, y, block, rotation: itemRotation })),
    logic_configs: logicConfigEdits,
  });

  const exportAndReanalyze = async () => {
    if (!version || !canExport) return;
    setBusy(true); setActionError(''); setAnalysis(null); setDownloaded(false);
    try {
      const blob = await exportResourceWorkbenchSchematicV2(workbench.resource.public_id, version.public_id, transformPayload());
      if (!blob.size) throw new Error(t('resourceWorkbenchV2.schematicEditor.exportFailed'));
      const file = new File([blob], suggestedFilename(version), { type: 'application/octet-stream' });
      const form = new FormData(); form.append('file', file);
      const result = await analyzeResourceWorkbenchVersionV2(workbench.resource.public_id, form);
      if (result.resource_kind !== 'schematic' || !('renderer_metadata' in result.analysis)) throw new Error(t('resourceWorkbenchV2.schematicEditor.reanalysisFailed'));
      setAnalysis(result.analysis);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.rel = 'noopener'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloaded(true);
    } catch (caught) { setActionError(caught instanceof V1ApiError && caught.message ? caught.message : t('resourceWorkbenchV2.schematicEditor.exportFailed')); }
    finally { setBusy(false); }
  };

  const saveAsNewVersion = async () => {
    if (!version || !canExport || savingVersion) return;
    setSavingVersion(true); setActionError(''); setVersionSaved(false);
    try {
      const transform = transformPayload(); const fingerprint = JSON.stringify({ source: version.public_id, transform });
      if (!saveAttempt.current || saveAttempt.current.fingerprint !== fingerprint) saveAttempt.current = { fingerprint, key: newIdempotencyKey() };
      const blob = await exportResourceWorkbenchSchematicV2(workbench.resource.public_id, version.public_id, transform);
      const file = new File([blob], suggestedFilename(version), { type: 'application/octet-stream' });
      const releaseChannel = ['release', 'beta', 'alpha', 'snapshot'].includes(version.release_channel) ? version.release_channel as 'release' | 'beta' | 'alpha' | 'snapshot' : 'release';
      const draft = await createResourceDirectVersionDraft(workbench.resource.public_id, {
        version: version.version, version_mode: version.version_mode === 'semver' ? 'semver' : 'compatibility', release_channel: releaseChannel,
        ...(version.game_version_min ? { game_version_min: version.game_version_min } : {}), ...(version.game_version_max ? { game_version_max: version.game_version_max } : {}),
      }, saveAttempt.current.key);
      if (draft.draft_status !== 'completed') await uploadResourceDirectDraft(draft.version_public_id, file);
      await onSaved?.(draft.version_public_id); saveAttempt.current = null; setVersionSaved(true);
    } catch (caught) { setActionError(caught instanceof V1ApiError && caught.message ? caught.message : t('resourceWorkbenchV2.schematicEditor.saveVersionFailed')); }
    finally { setSavingVersion(false); }
  };

  if (!canEdit) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.ownerOnly')}</p>;
  if (!version) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.noVersion')}</p>;
  if (version.status !== 'published') return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.publishedOnly')}</p>;

  return <div className="space-y-4">
    <p className="text-sm leading-6 text-[var(--text-secondary)]">蓝图编辑会生成新的官方 .msch 和 revision。支持多选移动、放置、删除、旋转/镜像、逻辑源码编辑和触屏缩放工作区。</p>
    {loading ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.loading')}</p> : null}
    {loadError ? <div role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300"><AlertCircle className="mr-2 inline h-4 w-4" />{loadError}</div> : null}

    {complete && dimensions ? <>
      <section className="space-y-3 border border-[var(--border)] p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">{([['select', '选择'], ['move', '移动'], ['place', '放置']] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={tool === mode} disabled={busy} onClick={() => { setTool(mode); setMoveAnchor(null); }} className={`inline-flex min-h-11 items-center gap-2 border px-4 text-sm ${tool === mode ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)]'}`}>{mode === 'move' ? <Move className="h-4 w-4" /> : null}{label}</button>)}</div>

        {tool === 'place' ? <div className="grid gap-3 border border-[var(--border)] p-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_auto]">
          <div className="space-y-2"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-muted)]" /><input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="搜索当前蓝图里的方块" className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] pl-9 pr-3 text-base sm:text-sm" /></label><select value={paletteBlock} onChange={(event) => { setPaletteBlock(event.target.value); setCustomBlock(''); }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm">{paletteGroups.map((group) => <option key={group.name} value={group.name}>{group.displayName || group.name} · {group.size}×{group.size}</option>)}</select></div>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><input value={customBlock} onChange={(event) => setCustomBlock(event.target.value)} placeholder="或输入 vanilla block internal name" className="min-h-11 min-w-0 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /><input type="number" min={1} max={16} value={customSize} onChange={(event) => setCustomSize(Math.max(1, Math.min(16, Number(event.target.value) || 1)))} aria-label="预览尺寸" className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm" /></div>
          <div className="flex gap-2"><button type="button" onClick={() => setPlacementRotation((value) => (value + 3) % 4)} className="flex h-11 w-11 items-center justify-center border border-[var(--border)]"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={() => setPlacementRotation((value) => (value + 1) % 4)} className="flex h-11 w-11 items-center justify-center border border-[var(--border)]"><RotateCw className="h-4 w-4" /></button><span className="flex min-h-11 items-center px-2 text-xs text-[var(--text-muted)]">{placementRotation * 90}°</span></div>
        </div> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">{selected.size ? <><button type="button" onClick={selectSameType} className="min-h-10 border border-[var(--border)] px-3 text-xs">选择同类</button><button type="button" onClick={deleteSelected} className="inline-flex min-h-10 items-center gap-2 border border-red-500/40 px-3 text-xs text-red-700 dark:text-red-300"><Trash2 className="h-3.5 w-3.5" />删除 {selected.size}</button></> : <span className="text-xs text-[var(--text-muted)]">点击选择；按住 Ctrl/⌘ 点击可多选。移动工具会整体平移当前选择。</span>}</div>
          <div className="flex items-center gap-1"><button type="button" onClick={() => setZoom((value) => Math.max(8, value - 2))} className="flex h-10 w-10 items-center justify-center border border-[var(--border)]"><ZoomOut className="h-4 w-4" /></button><span className="w-12 text-center text-xs tabular-nums text-[var(--text-muted)]">{zoom}px</span><button type="button" onClick={() => setZoom((value) => Math.min(36, value + 2))} className="flex h-10 w-10 items-center justify-center border border-[var(--border)]"><ZoomIn className="h-4 w-4" /></button></div>
        </div>

        <div className="max-h-[70vh] overflow-auto border border-[var(--border)] bg-[#111820] p-2 overscroll-contain">
          <svg role="grid" aria-label="蓝图编辑画布" width={dimensions.width * zoom} height={dimensions.height * zoom} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="block select-none touch-manipulation">
            <g transform={`translate(0 ${dimensions.height}) scale(1 -1)`}>
              {Array.from({ length: dimensions.width * dimensions.height }, (_unused, index) => {
                const x = index % dimensions.width; const y = Math.floor(index / dimensions.width);
                return <rect key={`cell:${x}:${y}`} role="gridcell" aria-label={`${x}, ${y}`} x={x} y={y} width="1" height="1" fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth="0.025" onClick={(event) => handleCell(x, y, event.ctrlKey || event.metaKey)} />;
              })}
              {visiblePlacements.map((placement) => {
                const index = Math.max(0, groups.findIndex((group) => group.name === placement.block));
                const colors = ['#71b7ff', '#84d39a', '#ffc875', '#df9df4', '#ff8e82', '#7bd7d2', '#a7c7e7']; const box = footprint(placement);
                return <g key={placement.key} pointerEvents="none"><rect x={box.left + 0.06} y={box.bottom + 0.06} width={placement.size - 0.12} height={placement.size - 0.12} fill={colors[index % colors.length]} fillOpacity="0.92" stroke={selected.has(placement.key) || moveAnchor === placement.key ? '#fff' : '#17202a'} strokeWidth={selected.has(placement.key) ? '0.12' : '0.06'} /><path d={`M ${placement.x + 0.5} ${placement.y + 0.5} l ${placement.rotation === 0 ? 0.28 : placement.rotation === 2 ? -0.28 : 0} ${placement.rotation === 1 ? 0.28 : placement.rotation === 3 ? -0.28 : 0}`} stroke="#111" strokeWidth="0.08" /></g>;
              })}
            </g>
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]"><span>{dimensions.width}×{dimensions.height} · {total} 方块</span><span>移动 {moves.length}</span><span>新增 {additions.length}</span><span>删除 {deleted.size}</span>{undoStack.length ? <button type="button" disabled={busy} onClick={undoLast} className="inline-flex min-h-10 items-center gap-1 border border-[var(--border)] px-3"><Undo2 className="h-3.5 w-3.5" />撤销</button> : null}</div>
      </section>

      {selectedLogicPlacement ? <section className="space-y-2 border border-[var(--border)] p-3 sm:p-4"><h4 className="text-sm font-semibold text-[var(--text)]">逻辑处理器 · {selectedLogicPlacement.displayName}</h4>{selectedLogicPlacement.logicLinks?.length ? <div className="flex flex-wrap gap-2">{selectedLogicPlacement.logicLinks.map((link, index) => <span key={`${link.name}:${index}`} className="border border-[var(--border)] px-2 py-1 font-mono text-xs">{link.name} → {link.x},{link.y}</span>)}</div> : null}<textarea maxLength={32_768} spellCheck={false} dir="ltr" disabled={busy} value={logicEdits[selectedLogicPlacement.key] ?? selectedLogicPlacement.logicSource ?? ''} onFocus={rememberEdit} onChange={(event) => { setLogicEdits((current) => ({ ...current, [selectedLogicPlacement.key]: event.target.value })); invalidatePreview(); }} className="min-h-48 w-full border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-base text-[var(--text)] sm:text-sm" /></section> : null}

      <section className="flex flex-wrap gap-2 border border-[var(--border)] p-3"><button type="button" disabled={busy} onClick={() => { rememberEdit(); setRotation((value) => (value + 3) % 4); invalidatePreview(); }} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><RotateCcw className="h-4 w-4" />整体左转</button><button type="button" disabled={busy} onClick={() => { rememberEdit(); setRotation((value) => (value + 1) % 4); invalidatePreview(); }} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><RotateCw className="h-4 w-4" />整体右转</button><button type="button" aria-pressed={mirrorX} disabled={busy} onClick={() => { rememberEdit(); setMirrorX((value) => !value); invalidatePreview(); }} className={`inline-flex min-h-11 items-center gap-2 border px-3 text-sm ${mirrorX ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)]'}`}><FlipHorizontal className="h-4 w-4" />水平镜像</button></section>

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 border border-[var(--border)] bg-[var(--bg-card)]/95 p-3 shadow-lg backdrop-blur">
        <button type="button" disabled={!canExport} onClick={() => void saveAsNewVersion()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none"><Save className="h-4 w-4" />{savingVersion ? '保存中…' : '保存为新版本'}</button>
        <button type="button" disabled={!canExport} onClick={() => void exportAndReanalyze()} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-4 text-sm disabled:opacity-40"><Download className="h-4 w-4" />{busy ? '处理中…' : '导出并重新分析'}</button>
        {versionSaved ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">新 revision 已创建</span> : null}{downloaded ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">已导出</span> : null}
      </div>
      {analysis ? <div className="border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-[var(--text-secondary)]">重新分析完成，renderer 已重新校验导出文件。</div> : null}
      {actionError ? <div role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{actionError}</div> : null}
    </> : null}

    {!loading && !loadError && groups.length > 0 && !complete ? <div role="alert" className="border border-amber-500/30 p-3 text-sm text-amber-800 dark:text-amber-200">方块坐标数据不完整，为避免破坏蓝图，本版本不开放写入。</div> : null}
    {!loading && !loadError && groups.length === 0 ? <p className="border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.noBlocks')}</p> : null}
  </div>;
}