'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, FlipHorizontal, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react';
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
import { V1ApiError } from '@/lib/api/v1/transport';
import { useI18n } from '@/i18n/provider';

type LogicLink = { name: string; x: number; y: number };
type Placement = { key: string; x: number; y: number; rotation: number | null; size: number; block: string; displayName: string; logicSource?: string; logicLinks?: LogicLink[] };
type BlockGroup = { name: string; displayName: string | null; count: number; placements: Placement[] };
type SchematicMove = { from_x: number; from_y: number; to_x: number; to_y: number };
type SchematicAddition = { x: number; y: number; block: string; rotation: number };
type EditSnapshot = { deleted: string[]; moves: SchematicMove[]; additions: SchematicAddition[]; logicEdits: Record<string, string>; rotation: number; mirrorX: boolean };

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `schematic-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeGroups(blocks: ResourceV2SchematicBlock[]): { groups: BlockGroup[]; complete: boolean; total: number } {
  let complete = blocks.length > 0;
  let total = 0;
  const groups = blocks.map((block) => {
    const positions = Array.isArray(block.positions) ? block.positions : [];
    const placements = positions.flatMap((position): Placement[] => {
      if (!Number.isInteger(position.x) || !Number.isInteger(position.y)) return [];
      const config = position.config && typeof position.config === 'object' && !Array.isArray(position.config)
        ? position.config as Record<string, unknown> : null;
      const source = config?.format_version === 1 && typeof config.source === 'string'
        && config.source.length <= 32_768 && !config.source.includes('\0') && position.logic_source_available === true
        ? config.source : undefined;
      const logicLinks = config?.format_version === 1 && Array.isArray(config.links) && config.links.length <= 1_000
        ? config.links.flatMap((raw): LogicLink[] => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
          const link = raw as Record<string, unknown>;
          return typeof link.name === 'string' && link.name.length > 0 && link.name.length <= 100
            && Number.isInteger(link.x) && Number.isInteger(link.y)
            ? [{ name: link.name, x: link.x as number, y: link.y as number }] : [];
        }) : undefined;
      return [{ key: `${position.x}:${position.y}`, x: position.x!, y: position.y!, rotation: position.rotation,
        size: Number.isInteger(position.size) && position.size! >= 1 && position.size! <= 64 ? position.size! : 1,
        block: block.internal_name, displayName: block.display_name || block.internal_name,
        ...(/processor/i.test(block.internal_name) && source !== undefined ? { logicSource: source } : {}),
        ...(/processor/i.test(block.internal_name) && logicLinks !== undefined ? { logicLinks } : {}),
      }];
    }).sort((left, right) => left.y - right.y || left.x - right.x);
    if (placements.length !== block.count || placements.length !== positions.length) complete = false;
    total += placements.length;
    return { name: block.internal_name, displayName: block.display_name, count: block.count, placements };
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (total > 10_000) complete = false;
  return { groups, complete, total };
}

function suggestedFilename(version: ResourceWorkbenchV2Version): string {
  const sourceName = version.files.find((file) => file.role === 'primary')?.original_filename
    || version.files[0]?.original_filename || 'schematic.msch';
  const stem = sourceName.split(/[\\/]/).pop()?.replace(/\.msch$/i, '') || 'schematic';
  return `${stem}-edited.msch`;
}

function schematicDimensions(workbench: ResourceWorkbenchV2Response): { width: number; height: number } | null {
  const width = workbench.resource.metadata.schematic?.width;
  const height = workbench.resource.metadata.schematic?.height;
  return Number.isInteger(width) && Number.isInteger(height) && width! > 0 && height! > 0 && width! <= 128 && height! <= 128
    ? { width: width!, height: height! }
    : null;
}

export default function SchematicLightEditor({
  workbench,
  version,
  canEdit,
  onSaved,
}: {
  workbench: ResourceWorkbenchV2Response;
  version: ResourceWorkbenchV2Version | null;
  canEdit: boolean;
  onSaved?: (versionPublicId: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<BlockGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [complete, setComplete] = useState(false);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState<SchematicMove[]>([]);
  const [additions, setAdditions] = useState<SchematicAddition[]>([]);
  const [logicEdits, setLogicEdits] = useState<Record<string, string>>({});
  const [tool, setTool] = useState<'select' | 'move' | 'place'>('select');
  const [moveSource, setMoveSource] = useState<string | null>(null);
  const [paletteBlock, setPaletteBlock] = useState('');
  const [undoStack, setUndoStack] = useState<EditSnapshot[]>([]);
  const [rotation, setRotation] = useState(0);
  const [mirrorX, setMirrorX] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [analysis, setAnalysis] = useState<ResourceWorkbenchV2VersionAnalysis | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionSaved, setVersionSaved] = useState(false);
  const versionPublicId = version?.public_id;
  const versionStatus = version?.status;

  useEffect(() => {
    setGroups([]); setSelected(new Set()); setDeleted(new Set()); setMoves([]); setAdditions([]); setLogicEdits({}); setUndoStack([]);
    setTool('select'); setMoveSource(null); setPaletteBlock(''); setRotation(0); setMirrorX(false);
    setAnalysis(null); setDownloaded(false); setVersionSaved(false); setActionError(''); setLoadError('');
    if (!canEdit || !versionPublicId || versionStatus !== 'published') { setComplete(false); setTotal(0); return; }
    let active = true;
    setLoading(true);
    void (async () => {
      const blocks: ResourceV2SchematicBlock[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await getResourceV2SchematicBlocks(workbench.resource.public_id, versionPublicId, { limit: 100, cursor });
        blocks.push(...page.items);
        cursor = page.pagination.has_more ? page.pagination.next_cursor || undefined : undefined;
        pages += 1;
      } while (cursor && pages < 10);
      const normalized = makeGroups(blocks);
      if (!active) return;
      setGroups(normalized.groups);
      setPaletteBlock(normalized.groups[0]?.name || '');
      setComplete(normalized.complete && !cursor);
      setTotal(normalized.total);
    })().catch((caught) => {
      if (active) setLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.schematicEditor.loadFailed'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canEdit, t, versionPublicId, versionStatus, workbench.resource.public_id]);

  const selectedCount = selected.size;
  const deletedCount = deleted.size;
  const dimensions = schematicDimensions(workbench);
  const hasPlacementEdits = moves.length > 0 || additions.length > 0;
  const logicConfigEdits = useMemo(() => groups.flatMap((group) => group.placements.flatMap((placement) => {
    const source = logicEdits[placement.key];
    return source !== undefined && source !== placement.logicSource ? [{
      x: placement.x, y: placement.y, source,
    }] : [];
  })), [groups, logicEdits]);
  const canExport = Boolean(canEdit && version?.status === 'published' && complete && !loading && !busy
    && (rotation !== 0 || mirrorX || deletedCount > 0 || hasPlacementEdits || logicConfigEdits.length > 0));
  const removedNames = useMemo(() => {
    const labels = new Map<string, string>();
    for (const group of groups) for (const placement of group.placements) labels.set(placement.key, group.displayName || group.name);
    return [...deleted].map((key) => ({ key, name: labels.get(key) || key }));
  }, [deleted, groups]);

  const toggleSelected = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const rememberEdit = () => setUndoStack((current) => [...current.slice(-49), {
    deleted: [...deleted], moves: [...moves], additions: [...additions], logicEdits: { ...logicEdits }, rotation, mirrorX,
  }]);

  const undoLast = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack((current) => current.slice(0, -1));
    setDeleted(new Set(previous.deleted)); setMoves(previous.moves); setAdditions(previous.additions);
    setLogicEdits(previous.logicEdits); setRotation(previous.rotation); setMirrorX(previous.mirrorX);
    setAnalysis(null); setDownloaded(false); setMoveSource(null);
  };

  const visiblePlacements = useMemo(() => {
    const moveBySource = new Map(moves.map((move) => [`${move.from_x}:${move.from_y}`, move]));
    const result: Placement[] = [];
    for (const group of groups) for (const placement of group.placements) {
      if (deleted.has(placement.key)) continue;
      const move = moveBySource.get(placement.key);
      result.push(move ? { ...placement, x: move.to_x, y: move.to_y } : placement);
    }
    for (const item of additions) result.push({
      key: `added:${item.x}:${item.y}:${item.block}`, x: item.x, y: item.y, rotation: item.rotation,
      size: 1, block: item.block, displayName: item.block,
    });
    return result;
  }, [additions, deleted, groups, moves]);

  const selectedLogicPlacement = visiblePlacements.find((placement) => selected.has(placement.key) && placement.logicSource !== undefined);
  const editCell = (x: number, y: number) => {
    const occupant = visiblePlacements.find((placement) => {
      const offset = -Math.floor((placement.size - 1) / 2);
      return x >= placement.x + offset && x < placement.x + offset + placement.size
        && y >= placement.y + offset && y < placement.y + offset + placement.size;
    });
    if (tool === 'select') {
      if (occupant && !occupant.key.startsWith('added:')) setSelected(new Set([occupant.key]));
      else setSelected(new Set());
      return;
    }
    if (tool === 'move') {
      if (!moveSource) {
        if (occupant && !occupant.key.startsWith('added:')) { setMoveSource(occupant.key); setSelected(new Set([occupant.key])); }
        return;
      }
      if (!occupant) {
        const [from_x, from_y] = moveSource.split(':').map(Number);
        rememberEdit();
        setMoves((current) => [...current.filter((move) => `${move.from_x}:${move.from_y}` !== moveSource), { from_x, from_y, to_x: x, to_y: y }]);
        setMoveSource(null); setSelected(new Set()); setAnalysis(null); setDownloaded(false);
      }
      return;
    }
    if (tool === 'place' && !occupant && paletteBlock) {
      rememberEdit();
      setAdditions((current) => [...current, { x, y, block: paletteBlock, rotation: 0 }]);
      setAnalysis(null); setDownloaded(false);
    }
  };

  const deleteSelected = () => {
    if (!selected.size) return;
    rememberEdit();
    setDeleted((current) => new Set([...current, ...selected]));
    setSelected(new Set());
    setAnalysis(null);
    setDownloaded(false);
  };

  const exportAndReanalyze = async () => {
    if (!version || !canExport) return;
    setBusy(true); setActionError(''); setAnalysis(null); setDownloaded(false);
    try {
      const positions = [...deleted].map((key) => {
        const [x, y] = key.split(':').map(Number);
        return { x, y };
      });
      const blob = await exportResourceWorkbenchSchematicV2(workbench.resource.public_id, version.public_id, {
        rotation_quarters: rotation,
        mirror_x: mirrorX,
        delete_positions: positions,
        move_positions: moves,
        add_blocks: additions,
        logic_configs: logicConfigEdits,
      });
      if (!blob.size) throw new Error(t('resourceWorkbenchV2.schematicEditor.exportFailed'));
      const file = new File([blob], suggestedFilename(version), { type: 'application/octet-stream' });
      const form = new FormData();
      form.append('file', file);
      const result = await analyzeResourceWorkbenchVersionV2(workbench.resource.public_id, form);
      if (result.resource_kind !== 'schematic' || !('renderer_metadata' in result.analysis)) {
        throw new Error(t('resourceWorkbenchV2.schematicEditor.reanalysisFailed'));
      }
      setAnalysis(result.analysis);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.rel = 'noopener';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch (caught) {
      const message = caught instanceof V1ApiError && caught.message
        ? caught.message
        : t('resourceWorkbenchV2.schematicEditor.exportFailed');
      setActionError(message);
    } finally {
      setBusy(false);
    }
  };

  const saveAsNewVersion = async () => {
    if (!version || !canExport || savingVersion) return;
    setSavingVersion(true); setActionError(''); setVersionSaved(false);
    try {
      const blob = await exportResourceWorkbenchSchematicV2(workbench.resource.public_id, version.public_id, {
        rotation_quarters: rotation,
        mirror_x: mirrorX,
        delete_positions: [...deleted].map((key) => { const [x, y] = key.split(':').map(Number); return { x, y }; }),
        move_positions: moves,
        add_blocks: additions,
        logic_configs: logicConfigEdits,
      });
      const file = new File([blob], suggestedFilename(version), { type: 'application/octet-stream' });
      const versionMode = version.version_mode === 'semver' ? 'semver' : 'compatibility';
      const releaseChannel = ['release', 'beta', 'alpha', 'snapshot'].includes(version.release_channel)
        ? version.release_channel as 'release' | 'beta' | 'alpha' | 'snapshot' : 'release';
      const draft = await createResourceDirectVersionDraft(workbench.resource.public_id, {
        version: version.version, version_mode: versionMode, release_channel: releaseChannel,
        ...(version.game_version_min ? { game_version_min: version.game_version_min } : {}),
        ...(version.game_version_max ? { game_version_max: version.game_version_max } : {}),
      }, newIdempotencyKey());
      await uploadResourceDirectDraft(draft.version_public_id, file);
      await onSaved?.(draft.version_public_id);
      setVersionSaved(true);
    } catch (caught) {
      setActionError(caught instanceof V1ApiError && caught.message ? caught.message : t('resourceWorkbenchV2.schematicEditor.saveVersionFailed'));
    } finally {
      setSavingVersion(false);
    }
  };

  if (!canEdit) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.ownerOnly')}</p>;
  if (!version) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.noVersion')}</p>;
  if (version.status !== 'published') return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.publishedOnly')}</p>;

  return <div className="space-y-4">
    <p className="text-sm leading-6 text-[var(--text-secondary)]">{t('resourceWorkbenchV2.schematicEditor.help')}</p>
    {version.preview_url && <img src={version.preview_url} alt={t('resourceWorkbenchV2.schematicEditor.previewAlt')} className="max-h-72 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] object-contain" />}
    {complete && dimensions && <section className="space-y-3 rounded-lg border border-[var(--border)] p-3" aria-label={t('resourceWorkbenchV2.schematicEditor.canvas')}>
      <div className="flex flex-wrap items-center gap-2">
        {(['select', 'move', 'place'] as const).map((mode) => <button key={mode} type="button" aria-pressed={tool === mode}
          disabled={busy} onClick={() => { setTool(mode); setMoveSource(null); }}
          className={`min-h-10 rounded-lg border px-3 text-sm ${tool === mode ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
          {t(`resourceWorkbenchV2.schematicEditor.${mode}Tool`)}
        </button>)}
        {tool === 'place' && <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--text-secondary)]">
          {t('resourceWorkbenchV2.schematicEditor.blockPalette')}
          <select aria-label={t('resourceWorkbenchV2.schematicEditor.blockPalette')} value={paletteBlock} onChange={(event) => setPaletteBlock(event.target.value)} className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-[var(--text)]">
            {groups.map((group) => <option key={group.name} value={group.name}>{group.displayName || group.name}</option>)}
          </select>
        </label>}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{t(`resourceWorkbenchV2.schematicEditor.${tool}Help`)}{moveSource ? ` · ${t('resourceWorkbenchV2.schematicEditor.moveSource', { position: moveSource })}` : ''}</p>
      <svg role="grid" aria-label={t('resourceWorkbenchV2.schematicEditor.canvas')} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="block w-full rounded-lg border border-[var(--border)] bg-[#111820]" style={{ maxHeight: '32rem' }}>
        <g transform={`translate(0 ${dimensions.height}) scale(1 -1)`}>
          {Array.from({ length: dimensions.width * dimensions.height }, (_unused, index) => {
            const x = index % dimensions.width;
            const y = Math.floor(index / dimensions.width);
            return <rect key={`cell:${x}:${y}`} data-cell={`${x}:${y}`} role="gridcell" aria-label={`${x}, ${y}`} tabIndex={0}
              x={x} y={y} width="1" height="1" fill="transparent" stroke="rgba(255,255,255,0.14)" strokeWidth="0.025"
              onClick={() => editCell(x, y)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); editCell(x, y); } }} />;
          })}
          {visiblePlacements.map((placement) => {
            const groupIndex = Math.max(0, groups.findIndex((group) => group.name === placement.block));
            const colors = ['#71b7ff', '#84d39a', '#ffc875', '#df9df4', '#ff8e82', '#7bd7d2'];
            const offset = -Math.floor((placement.size - 1) / 2);
            return <g key={placement.key} pointerEvents="none">
              <rect x={placement.x + offset + 0.08} y={placement.y + offset + 0.08} width={placement.size - 0.16} height={placement.size - 0.16} rx="0.12" fill={colors[groupIndex % colors.length]} fillOpacity="0.9"
                stroke={selected.has(placement.key) || moveSource === placement.key ? '#ffffff' : '#17202a'} strokeWidth="0.08" />
            </g>;
          })}
        </g>
      </svg>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>{t('resourceWorkbenchV2.schematicEditor.canvasDimensions', { width: dimensions.width, height: dimensions.height })}</span>
        {undoStack.length > 0 && <button type="button" disabled={busy} onClick={undoLast} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-[var(--text-secondary)]"><Undo2 className="h-3.5 w-3.5" />{t('resourceWorkbenchV2.schematicEditor.undoLast')}</button>}
      </div>
    </section>}
    {selectedLogicPlacement && <section className="space-y-2 rounded-lg border border-[var(--border)] p-3">
      <label htmlFor="schematic-logic-source" className="block text-sm font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.schematicEditor.logicSource')}</label>
      <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.logicSourceHelp')}</p>
      {selectedLogicPlacement.logicLinks?.length ? <ul aria-label={t('resourceWorkbenchV2.schematicEditor.logicLinks')} className="space-y-1 text-xs text-[var(--text-secondary)]">
        {selectedLogicPlacement.logicLinks.map((link, index) => <li key={`${link.name}:${link.x}:${link.y}:${index}`}><code>{link.name}</code> · {link.x}, {link.y}</li>)}
      </ul> : null}
      <textarea id="schematic-logic-source" maxLength={32_768} spellCheck={false} dir="ltr" disabled={busy}
        value={logicEdits[selectedLogicPlacement.key] ?? selectedLogicPlacement.logicSource ?? ''}
        onFocus={rememberEdit}
        onChange={(event) => { setLogicEdits((current) => ({ ...current, [selectedLogicPlacement.key]: event.target.value })); setAnalysis(null); setDownloaded(false); }}
        className="min-h-36 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-sm text-[var(--text)]" />
    </section>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => { rememberEdit(); setRotation((value) => (value + 3) % 4); setAnalysis(null); setDownloaded(false); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-50"><RotateCcw className="h-4 w-4" />{t('resourceWorkbenchV2.schematicEditor.rotateLeft')}</button>
      <button type="button" disabled={busy} onClick={() => { rememberEdit(); setRotation((value) => (value + 1) % 4); setAnalysis(null); setDownloaded(false); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-50"><RotateCw className="h-4 w-4" />{t('resourceWorkbenchV2.schematicEditor.rotateRight')}</button>
      <button type="button" aria-pressed={mirrorX} disabled={busy} onClick={() => { rememberEdit(); setMirrorX((value) => !value); setAnalysis(null); setDownloaded(false); }} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm disabled:opacity-50 ${mirrorX ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)]'}`}><FlipHorizontal className="h-4 w-4" />{t('resourceWorkbenchV2.schematicEditor.mirror')}</button>
      <button type="button" disabled={!selectedCount || busy} onClick={deleteSelected} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-500/40 px-3 text-sm text-red-700 disabled:opacity-40 dark:text-red-300"><Trash2 className="h-4 w-4" />{t('resourceWorkbenchV2.schematicEditor.deleteSelected')} · {selectedCount}</button>
    </div>

    {loading && <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.loading')}</p>}
    {loadError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"><AlertCircle className="mr-2 inline h-4 w-4" />{t('resourceWorkbenchV2.schematicEditor.loadFailed')}: {loadError}</div>}
    {!loading && !loadError && groups.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.noBlocks')}</p>}
    {!loading && !loadError && groups.length > 0 && !complete && <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">{t('resourceWorkbenchV2.schematicEditor.incompleteBlocks')}</div>}

    {complete && <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.blockPositions', { count: total })}</p>
      {groups.map((group) => <details key={group.name} className="rounded-lg border border-[var(--border)]">
        <summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium text-[var(--text)]">{group.displayName || group.name} · {group.count}</summary>
        <div className="grid grid-cols-2 gap-1 border-t border-[var(--border)] p-2 sm:grid-cols-4">
          {group.placements.map((placement) => {
            const isDeleted = deleted.has(placement.key);
            return <label key={placement.key} className={`flex min-h-11 items-center gap-2 rounded px-2 text-xs ${isDeleted ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
              <input type="checkbox" disabled={busy || isDeleted} checked={selected.has(placement.key)} onChange={() => toggleSelected(placement.key)} className="h-4 w-4 accent-[var(--primary)]" />
              <span>{placement.x}, {placement.y}{placement.rotation !== null ? ` · ${placement.rotation}` : ''}</span>
            </label>;
          })}
        </div>
      </details>)}
    </div>}

    {removedNames.length > 0 && <section aria-label={t('resourceWorkbenchV2.schematicEditor.removed')} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
      <h4 className="text-sm font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.schematicEditor.removed')}: {removedNames.length}</h4>
      <div className="flex flex-wrap gap-2">{removedNames.slice(0, 100).map((item) => <button key={item.key} type="button" disabled={busy} onClick={() => { setDeleted((current) => { const next = new Set(current); next.delete(item.key); return next; }); setAnalysis(null); setDownloaded(false); }} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-[var(--bg-elevated)] px-3 text-xs text-[var(--text-secondary)] disabled:opacity-50"><Undo2 className="h-3.5 w-3.5" />{item.name} · {item.key} · {t('resourceWorkbenchV2.schematicEditor.undo')}</button>)}</div>
    </section>}

    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
      <button type="button" disabled={!canExport} onClick={() => void exportAndReanalyze()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4" />{busy ? t('resourceWorkbenchV2.schematicEditor.exporting') : t('resourceWorkbenchV2.schematicEditor.export')}</button>
      <button type="button" disabled={!canExport || savingVersion} onClick={() => void saveAsNewVersion()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40">{savingVersion ? t('resourceWorkbenchV2.schematicEditor.savingVersion') : t('resourceWorkbenchV2.schematicEditor.saveVersion')}</button>
      <span className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.rotationStatus', { count: rotation, mirror: mirrorX ? t('resourceWorkbenchV2.schematicEditor.enabled') : t('resourceWorkbenchV2.schematicEditor.disabled') })}</span>
    </div>
    {actionError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{actionError}</div>}
    {busy && <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.reanalyzing')}</p>}
    {downloaded && analysis && 'renderer_metadata' in analysis && <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-200">
      <p className="font-semibold">{t('resourceWorkbenchV2.schematicEditor.reanalysisComplete')}</p>
      <p className="mt-1">{t('resourceWorkbenchV2.schematicEditor.exportedFile', { count: Number(analysis.renderer_metadata?.block_count ?? analysis.renderer_metadata?.blocks ?? 0) })}</p>
      <p className="mt-1">{t('resourceWorkbenchV2.schematicEditor.exportDiff', {
        source: total,
        output: Number(analysis.renderer_metadata?.block_count ?? analysis.renderer_metadata?.blocks ?? 0),
        delta: Number(analysis.renderer_metadata?.block_count ?? analysis.renderer_metadata?.blocks ?? 0) - total,
      })}</p>
      {analysis.findings.length > 0 && <ul className="mt-2 list-inside list-disc">{analysis.findings.map((finding, index) => <li key={`${finding.key || finding.code || 'finding'}:${index}`}>{finding.message}</li>)}</ul>}
    </div>}
    {versionSaved && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-200">{t('resourceWorkbenchV2.schematicEditor.versionSaved')}</p>}
  </div>;
}
