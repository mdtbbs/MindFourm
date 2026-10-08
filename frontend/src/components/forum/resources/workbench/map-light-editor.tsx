'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, RotateCcw, Save } from 'lucide-react';
import {
  createResourceDirectVersionDraft,
  exportResourceWorkbenchMapV2,
  getResourceWorkbenchV2KindTabData,
  uploadResourceDirectDraft,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
  type ResourceV2MapTransformInput,
  type ResourceV2MapObjectOperation,
} from '@/lib/api/v1/resources';
import { fetchV1 } from '@/lib/api/v1/transport';
import { useI18n } from '@/i18n/provider';
import WaveEditor from './wave-editor';
import { useEditorHistory } from './editor-history';
import EditorCanvas, { type CanvasPoint } from './editor-canvas';
import MapTileImage from './map-tile-image';
import ContentPicker, { useEditorCatalog } from './content-picker';
import { RULE_LABELS, RULE_GROUPS, TEAM_LABELS, OBJECT_LABELS } from './map-rule-labels';
import type { EditorSource, EditorContext } from './editor-source';
import { downloadEditorFile } from './editor-source';
import { publishEditorCopy } from './publish-editor-copy';
import { useAuth } from '@/store/user-store';

type TerrainCell = { x: number; y: number; floor: string; overlay: string };
type MapObject = { x: number; y: number; name?: string; team?: string; size?: number; rotation?: number };
type MapObjectType = 'core' | 'spawn' | 'building';
type MapObjectCatalog = { cores: string[]; spawns: string[]; buildings: string[]; teams: string[] };
type WaveGroup = Record<string, unknown>;
type EditorData = {
  width: number;
  height: number;
  rules: Record<string, unknown>;
  terrain: TerrainCell[];
  buildings: MapObject[];
  enemySpawns: MapObject[];
  cores: MapObject[];
  catalog: MapObjectCatalog;
  truncated: boolean;
  objectsTruncated: boolean;
};

type TerrainSnapshot = Record<string, TerrainCell>;

const BOOLEAN_RULES = [
  'waves', 'waveTimer', 'waveSending', 'attackMode', 'pvp', 'infiniteResources', 'schematicsAllowed', 'logicUnitControl',
  'logicUnitBuild', 'logicUnitDeconstruct', 'reactorExplosions', 'fire', 'damageExplosions', 'ghostBlocks', 'waitEnemies',
  'canGameOver', 'coreCapture', 'disableUnitCap', 'lighting', 'hideSpawns', 'placeRangeCheck', 'onlyDepositCore',
] as const;
const INTEGER_RULES = ['unitCap', 'winWave', 'environment'] as const;
const NUMBER_RULES = [
  'solarMultiplier', 'unitBuildSpeedMultiplier', 'unitCostMultiplier', 'unitDamageMultiplier', 'unitHealthMultiplier',
  'blockHealthMultiplier', 'blockDamageMultiplier', 'buildCostMultiplier', 'buildSpeedMultiplier',
  'deconstructRefundMultiplier', 'enemyCoreBuildRadius', 'dropZoneRadius', 'waveSpacing', 'initialWaveSpacing',
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function objectLayer(value: unknown): MapObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MapObject[] => {
    const row = record(item);
    if (!row || !Number.isInteger(row.x) || !Number.isInteger(row.y)) return [];
    return [{ x: row.x as number, y: row.y as number, name: typeof row.name === 'string' ? row.name : undefined, team: typeof row.team === 'string' ? row.team : undefined, size: Number.isInteger(row.size) ? row.size as number : undefined, rotation: Number(row.rotation || 0) }];
  });
}

function readEditorData(summary: Record<string, unknown> | null): EditorData | null {
  const width = summary?.width;
  const height = summary?.height;
  const layers = record(summary?.tile_layers);
  const rawCatalog = record(layers?.object_catalog);
  const catalogNames = (value: unknown) => Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string' && /^[a-zA-Z0-9_.:-]{1,191}$/.test(name)) : [];
  const rawTerrain = layers?.terrain;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0
    || (width as number) * (height as number) > 2_000_000 || !Array.isArray(rawTerrain)) return null;
  const terrain = rawTerrain.flatMap((value): TerrainCell[] => {
    const cell = record(value);
    if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || typeof cell.name !== 'string') return [];
    return [{ x: cell.x as number, y: cell.y as number, floor: cell.name, overlay: typeof cell.overlay === 'string' ? cell.overlay : 'air' }];
  });
  const rules = { ...(summary || {}) };
  delete rules.tile_layers; delete rules.tile_layers_truncated; delete rules.width; delete rules.height;
  return {
    width: width as number,
    height: height as number,
    rules,
    terrain,
    buildings: objectLayer(layers?.buildings),
    enemySpawns: objectLayer(layers?.enemy_spawns),
    cores: objectLayer(summary?.cores),
    catalog: {
      cores: catalogNames(rawCatalog?.cores), spawns: catalogNames(rawCatalog?.spawns),
      buildings: catalogNames(rawCatalog?.buildings), teams: catalogNames(rawCatalog?.teams),
    },
    truncated: summary?.tile_layers_truncated === true,
    objectsTruncated: layers?.objects_truncated === true,
  };
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `map-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileName(version: ResourceWorkbenchV2Version): string {
  const name = version.files.find((file) => file.role === 'primary')?.original_filename || 'map.msav';
  const stem = name.split(/[\\/]/).pop()?.replace(/\.msav$/i, '') || 'map';
  return `${stem}-edited.msav`;
}

function floorColor(name: string): string {
  const value = name.toLowerCase();
  if (value.includes('water') || value.includes('mud')) return '#337c9e';
  if (value.includes('sand')) return '#bd9958';
  if (value.includes('snow') || value.includes('ice')) return '#a9d7e3';
  if (value.includes('spore') || value.includes('grass')) return '#6d8f63';
  if (value.includes('dark')) return '#404957';
  if (value.includes('slag')) return '#b95c36';
  return '#7b7770';
}

export default function MapLightEditor({ workbench, version, canEdit, canManage = canEdit, source, initialTab, onSaved }: {
  workbench: EditorContext;
  version: ResourceWorkbenchV2Version | null;
  canEdit: boolean;
  canManage?: boolean;
  source?: EditorSource;
  initialTab?: 'terrain' | 'rules' | 'waves' | 'objects';
  onSaved?: (versionPublicId: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { items: catalog } = useEditorCatalog();
  const [zoom, setZoom] = useState(12);
  const [terrainTool, setTerrainTool] = useState<'paint' | 'erase' | 'rectangle' | 'fill' | 'select' | 'paste' | 'pan'>('paint');
  const [paintLayer, setPaintLayer] = useState<'floor' | 'overlay' | 'both'>('both');
  const [selection, setSelection] = useState<{ from: CanvasPoint; to: CanvasPoint } | null>(null);
  const [clipboard, setClipboard] = useState<TerrainCell[]>([]);
  const [coordinate, setCoordinate] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [showCoreSpawns, setShowCoreSpawns] = useState(true);
  const [selectedObject, setSelectedObject] = useState<{ type: MapObjectType; item: MapObject } | null>(null);
  const [partition, setPartition] = useState({ x: 0, y: 0 });
  const [copyTitle, setCopyTitle] = useState(`${workbench.resource.title} · 编辑版`);
  const [editor, setEditor] = useState<EditorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [terrainEdits, setTerrainEdits] = useState<TerrainSnapshot>({});

  const [ruleEdits, setRuleEdits] = useState<Record<string, unknown>>({});
  const [waveGroups, setWaveGroups] = useState<WaveGroup[]>([]);
  const [waveOperations, setWaveOperations] = useState<NonNullable<ResourceV2MapTransformInput['wave_operations']>>([]);
  const [objectOperations, setObjectOperations] = useState<ResourceV2MapObjectOperation[]>([]);
  const [newObjectType, setNewObjectType] = useState<MapObjectType>('building');
  const [newObjectName, setNewObjectName] = useState('');
  const [newObjectX, setNewObjectX] = useState(0);
  const [newObjectY, setNewObjectY] = useState(0);
  const [newObjectTeam, setNewObjectTeam] = useState('');
  const [newObjectRotation, setNewObjectRotation] = useState(0);
  const [floorChoice, setFloorChoice] = useState('');
  const [overlayChoice, setOverlayChoice] = useState('air');
  const [brushSize, setBrushSize] = useState<1 | 3 | 5>(1);
  const [painting, setPainting] = useState(false);
  const [tab, setTab] = useState<'terrain' | 'rules' | 'waves' | 'objects'>(initialTab || 'terrain');
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const copyAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const saveAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const history = useEditorHistory({ terrainEdits, ruleEdits, waveGroups, waveOperations, objectOperations }, previous => {
    setTerrainEdits(previous.terrainEdits); setRuleEdits(previous.ruleEdits); setWaveGroups(previous.waveGroups);
    setWaveOperations(previous.waveOperations); setObjectOperations(previous.objectOperations); setSaved(false); setError('');
  });
  const versionId = version?.public_id;
  const { reset: resetHistory } = history;
  const translateRef = useRef(t); translateRef.current = t;

  useEffect(() => {
    setEditor(null); setTerrainEdits({}); resetHistory(); setRuleEdits({}); setWaveOperations([]); setWaveGroups([]); setObjectOperations([]);
    setLoadError(''); setError(''); setSaved(false); saveAttempt.current = null;
    if (!versionId) return;
    const controller = new AbortController();
    setLoading(true);
    void (source ? Promise.resolve({ summary: { ...source.metadata, ...(source.metadata.rules as Record<string, unknown> || {}) } }) : getResourceWorkbenchV2KindTabData(workbench.resource.public_id, 'map', 'rules', versionId, undefined, { signal: controller.signal }))
      .then(async (result) => {
        let data = readEditorData(result.summary);
        if (!data && !source) { const legacy = await fetchV1<{ metadata: Record<string, unknown> }>(`/resources/${encodeURIComponent(workbench.resource.public_id)}/versions/${encodeURIComponent(versionId)}/editor-data`); data = readEditorData({ ...legacy.metadata, ...(legacy.metadata.rules as Record<string, unknown> || {}) }); }
        if (controller.signal.aborted) return;
        if (!data) throw new Error(translateRef.current('resourceWorkbenchV2.mapEditor.unsupportedSize'));
        setEditor(data);
        setFloorChoice(data.terrain[0]?.floor || 'stone');
        setNewObjectName(data.catalog.buildings[0] || data.catalog.cores[0] || data.catalog.spawns[0] || '');
        setNewObjectTeam(data.catalog.teams[0] || '');
        setWaveGroups(Array.isArray(data.rules.spawns) ? data.rules.spawns.flatMap((value): WaveGroup[] => record(value) ? [record(value)!] : []) : []);
      })
      .catch((caught) => { if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : translateRef.current('resourceWorkbenchV2.mapEditor.loadFailed')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [resetHistory, source, versionId, workbench.resource.public_id]);

  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  }, []);

  const floors = useMemo(() => [...new Set((editor?.terrain || []).map((cell) => cell.floor))].sort(), [editor]);
  const overlays = useMemo(() => ['air', ...new Set((editor?.terrain || []).map((cell) => cell.overlay).filter((name) => name !== 'air'))].sort((a, b) => a === 'air' ? -1 : b === 'air' ? 1 : a.localeCompare(b)), [editor]);
  const terrainIndex = useMemo(() => new Map((editor?.terrain || []).map((cell) => [`${cell.x}:${cell.y}`, cell])), [editor]);
  const completeTerrain = Boolean(editor && !editor.truncated && editor.terrain.length === editor.width * editor.height);
  const objectChoices = useMemo(() => {
    if (!editor) return [];
    return editor.catalog[`${newObjectType}s` as 'cores' | 'spawns' | 'buildings'];
  }, [editor, newObjectType]);
  const canSave = Boolean(canEdit && version?.status === 'published' && editor && !loading && !busy
    && (Object.keys(ruleEdits).length > 0 || waveOperations.length > 0 || (!editor.objectsTruncated && objectOperations.length > 0) || Object.keys(terrainEdits).length > 0));

  const paintCells = (points: CanvasPoint[], remember = false) => {
    if (!editor || !floorChoice) return;
    if (remember) history.remember();
    const radius = Math.floor(brushSize / 2);
    setTerrainEdits((current) => {
      const next = { ...current };
      for (const { x, y } of points) for (let dx = -radius; dx <= radius; dx += 1) for (let dy = -radius; dy <= radius; dy += 1) {
        const tx = x + dx; const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= editor.width || ty >= editor.height) continue;
        const base = terrainIndex.get(`${tx}:${ty}`);
        if (base) next[`${tx}:${ty}`] = { ...base, floor: terrainTool === 'erase' ? base.floor : paintLayer === 'overlay' ? (current[`${tx}:${ty}`] || base).floor : floorChoice, overlay: terrainTool === 'erase' ? 'air' : paintLayer === 'floor' ? (current[`${tx}:${ty}`] || base).overlay : overlayChoice };
      }
      if (Object.keys(next).length > 5000) { setError('一次最多修改 5000 格，请先导出再继续'); return current; }
      return next;
    });
    setSaved(false);
  };

  const paintCell = (x: number, y: number, remember = false) => paintCells([{ x, y }], remember);
  const undoTerrain = history.undo;
  const changeRule = (key: string, value: unknown) => { history.remember(); setRuleEdits(current => ({ ...current, [key]: value })); setSaved(false); setError(''); };
  const ruleValue = (key: string) => Object.prototype.hasOwnProperty.call(ruleEdits, key) ? ruleEdits[key] : editor?.rules[key];
  const queueObjectChanges = (type: MapObjectType, item: MapObject, next: ResourceV2MapObjectOperation[]) => {
    if (busy || editor?.objectsTruncated) return;
    for (const change of next) if (change.action === 'move' && !validateObject(type, item, change.to_x, change.to_y)) return;
    history.remember();
    const addition = objectOperations.find(operation => operation.action === 'add' && operation.object_type === type && operation.x === item.x && operation.y === item.y);
    if (addition?.action === 'add') {
      setObjectOperations(current => current.flatMap(operation => {
        if (operation !== addition) return [operation];
        if (next.some(change => change.action === 'delete')) return [];
        let updated = { ...addition };
        for (const change of next) {
          if (change.action === 'move') updated = { ...updated, x: change.to_x, y: change.to_y };
          if (change.action === 'team') updated = { ...updated, team: change.team };
          if (change.action === 'rotate') updated = { ...updated, rotation: change.rotation };
        }
        return [updated];
      })); setSelectedObject(null); setSaved(false); return;
    }
    setObjectOperations((current) => [
      ...current.filter((operation) => operation.action === 'add' || operation.object_type !== type
        || (operation.action === 'move' ? operation.from_x !== item.x || operation.from_y !== item.y : operation.x !== item.x || operation.y !== item.y)
        || (next.length > 0 && !next.some(change => change.action === 'delete' || change.action === operation.action))),
      ...next,
    ]);
    setSaved(false); setError('');
  };
  const addMapObject = () => {
    if (!editor || !objectChoices.includes(newObjectName) || !Number.isInteger(newObjectX) || !Number.isInteger(newObjectY)
      || newObjectX < 0 || newObjectY < 0 || newObjectX >= editor.width || newObjectY >= editor.height
      || (newObjectType !== 'spawn' && !editor.catalog.teams.includes(newObjectTeam))) return;
    if (!validateObject(newObjectType, { x: -1, y: -1, name: newObjectName, size: catalog.find(content => content.name === newObjectName)?.size || 1 }, newObjectX, newObjectY)) return;
    history.remember();
    setObjectOperations((current) => [...current, {
      action: 'add', object_type: newObjectType, x: newObjectX, y: newObjectY, name: newObjectName,
      ...(newObjectType !== 'spawn' ? { team: newObjectTeam, rotation: newObjectRotation } : {}),
    }]);
    setSaved(false); setError('');
  };

  const visibleObjects = useMemo(() => {
    if (!editor) return [];
    const originals = ([['core', editor.cores], ['spawn', editor.enemySpawns], ['building', editor.buildings]] as const).flatMap(([type, items]) => items.map(item => ({ type, item })));
    const added = objectOperations.flatMap(operation => operation.action === 'add' ? [{ type: operation.object_type, item: { x: operation.x, y: operation.y, name: operation.name, team: operation.team, rotation: operation.rotation, size: catalog.find(content => content.name === operation.name)?.size || 1 } }] : []);
    return [...originals, ...added].flatMap(entry => {
      const changes = objectOperations.filter(operation => operation.action !== 'add' && operation.object_type === entry.type && (operation.action === 'move' ? operation.from_x === entry.item.x && operation.from_y === entry.item.y : operation.x === entry.item.x && operation.y === entry.item.y));
      if (changes.some(operation => operation.action === 'delete')) return [];
      const move = changes.find(operation => operation.action === 'move');
      return [{ ...entry, x: move?.action === 'move' ? move.to_x : entry.item.x, y: move?.action === 'move' ? move.to_y : entry.item.y }];
    });
  }, [catalog, editor, objectOperations]);
  const validateObject = (type: MapObjectType, item: MapObject, x: number, y: number) => {
    if (!editor) return false;
    const size = item.size || 1, offset = -Math.floor((size-1)/2);
    const left = x+offset, bottom = y+offset;
    if (!Number.isInteger(x) || !Number.isInteger(y) || left < 0 || bottom < 0 || left+size > editor.width || bottom+size > editor.height) { setError('对象占地超出地图边界，请换一个位置'); return false; }
    const collision = visibleObjects.some(entry => {
      if (entry.type === type && entry.item.x === item.x && entry.item.y === item.y) return false;
      if (type === 'spawn') return entry.type === 'spawn' && entry.x === x && entry.y === y;
      if (entry.type === 'spawn') return false;
      const otherSize = entry.item.size || 1, otherOffset = -Math.floor((otherSize-1)/2);
      return left < entry.x+otherOffset+otherSize && left+size > entry.x+otherOffset && bottom < entry.y+otherOffset+otherSize && bottom+size > entry.y+otherOffset;
    });
    if (collision) { setError('这里已有对象，不能覆盖。请移动到空白位置'); return false; }
    return true;
  };
  const objectAt = (target: CanvasPoint) => visibleObjects.find(entry => {
    const offset = -Math.floor(((entry.item.size || 1)-1)/2); return target.x >= entry.x+offset && target.x < entry.x+offset+(entry.item.size || 1) && target.y >= entry.y+offset && target.y < entry.y+offset+(entry.item.size || 1);
  });
  const largeMap = Boolean(editor && editor.width * editor.height > 10_000);
  const region = { x: largeMap ? partition.x * 128 : 0, y: largeMap ? partition.y * 128 : 0 };
  const viewWidth = editor ? largeMap ? Math.min(128, editor.width - region.x) : editor.width : 1;
  const viewHeight = editor ? largeMap ? Math.min(128, editor.height - region.y) : editor.height : 1;
  const visibleTerrain = useMemo(() => (editor?.terrain || []).filter(cell => cell.x >= region.x && cell.y >= region.y && cell.x < region.x + viewWidth && cell.y < region.y + viewHeight).map(cell => { const current = terrainEdits[`${cell.x}:${cell.y}`] || cell; return { ...current, x: cell.x - region.x, y: cell.y - region.y }; }), [editor, region.x, region.y, terrainEdits, viewHeight, viewWidth]);
  const regionComplete = visibleTerrain.length === viewWidth * viewHeight;
  useEffect(() => {
    if (!largeMap || regionComplete || !versionId) return;
    let active = true; setLoading(true);
    const request = source?.loadRegion ? source.loadRegion(region.x, region.y) : fetchV1<{ terrain: TerrainCell[] }>(`/resources/${encodeURIComponent(workbench.resource.public_id)}/versions/${encodeURIComponent(versionId)}/map-editor/region?x=${region.x}&y=${region.y}`);
    void request.then(result => {
      if (!active) return;
      setEditor(current => current ? { ...current, terrain: [...current.terrain.filter(cell => cell.x < region.x || cell.x >= region.x + 128 || cell.y < region.y || cell.y >= region.y + 128), ...result.terrain] } : current);
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : '分区加载失败'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [largeMap, region.x, region.y, regionComplete, source, versionId, workbench.resource.public_id]);
  const changeRegion = (from: CanvasPoint, to: CanvasPoint, flood = false) => {
    if (!editor) return;
    const points: CanvasPoint[] = [];
    if (flood) {
      const queue = [from], visited = new Set<string>();
      const first = terrainEdits[`${from.x}:${from.y}`] || terrainIndex.get(`${from.x}:${from.y}`);
      while (queue.length) { const point = queue.pop()!; const key = `${point.x}:${point.y}`; if (visited.has(key)) continue; visited.add(key); const cell = terrainEdits[key] || terrainIndex.get(key);
        if (!cell || !first || (paintLayer !== 'overlay' && cell.floor !== first.floor) || (paintLayer !== 'floor' && cell.overlay !== first.overlay)) continue;
        points.push(point); if (points.length > 5000) { setError('填充区域超过 5000 格，请分区修改'); return; }
        queue.push({ x: point.x - 1, y: point.y }, { x: point.x + 1, y: point.y }, { x: point.x, y: point.y - 1 }, { x: point.x, y: point.y + 1 });
      }
    } else { for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) points.push({ x, y }); }
    const next = { ...terrainEdits };
    for (const point of points) { const key = `${point.x}:${point.y}`, base = terrainIndex.get(key); if (!base) { setError('区域尚未加载，不能修改未知地形'); return; } const current = next[key] || base; next[key] = { ...current, floor: paintLayer === 'overlay' ? current.floor : floorChoice, overlay: paintLayer === 'floor' ? current.overlay : overlayChoice }; }
    if (Object.keys(next).length > 5000) { setError('单次导出最多修改 5000 格，请导出后继续编辑'); return; }
    history.remember(); setTerrainEdits(next); setSaved(false); setError('');
  };
  const copyRegion = () => {
    if (!selection) return; const minX = Math.min(selection.from.x, selection.to.x), minY = Math.min(selection.from.y, selection.to.y);
    const cells = (editor?.terrain || []).filter(cell => cell.x >= minX && cell.x <= Math.max(selection.from.x, selection.to.x) && cell.y >= minY && cell.y <= Math.max(selection.from.y, selection.to.y)).map(cell => ({ ...(terrainEdits[`${cell.x}:${cell.y}`] || cell), x: cell.x - minX, y: cell.y - minY }));
    if (cells.length > 5000) { setError('复制区域超过 5000 格'); return; } setClipboard(cells);
  };
  const pasteRegion = (anchor: CanvasPoint) => {
    const next = { ...terrainEdits }; for (const cell of clipboard) { const x = anchor.x + cell.x, y = anchor.y + cell.y; if (!terrainIndex.has(`${x}:${y}`)) { setError('粘贴超出地图或已加载区域'); return; } next[`${x}:${y}`] = { ...cell, x, y }; }
    if (Object.keys(next).length > 5000) { setError('粘贴超过 5000 格的导出上限'); return; } history.remember(); setTerrainEdits(next); setSaved(false); setError('');
  };
  const operations = (): ResourceV2MapTransformInput => ({ terrain_changes: Object.values(terrainEdits), rule_changes: ruleEdits, wave_operations: waveOperations, object_operations: objectOperations });
  const exportBlob = () => source ? source.exportFile(operations()) : exportResourceWorkbenchMapV2(workbench.resource.public_id, version!.public_id, operations());
  const downloadMap = async () => { if (!version || busy) return; setBusy(true); setError(''); try { downloadEditorFile(await exportBlob(), fileName(version)); } catch (caught) { setError(caught instanceof Error ? caught.message : '导出失败'); } finally { setBusy(false); } };
  const publishCopy = async () => {
    const fingerprint = JSON.stringify([version?.public_id, copyTitle, terrainEdits, ruleEdits, waveOperations, objectOperations]); if (copyAttempt.current?.fingerprint !== fingerprint) copyAttempt.current = { fingerprint, key: crypto.randomUUID() }; if (!version || busy || !copyTitle.trim()) return; setBusy(true); setError(''); try { const file = new File([await exportBlob()], fileName(version), { type: 'application/octet-stream' }); if (source) await source.publishFile(file, copyTitle); else { const draft = await publishEditorCopy(file, 'map', copyTitle, workbench.resource.public_id, copyAttempt.current!.key); window.location.assign(`/resources/${draft.resource_public_id}/workbench`); } } catch (caught) { setError(caught instanceof Error ? caught.message : '发布失败'); } finally { setBusy(false); } };

  const saveNewVersion = async () => {
    if (!version || !editor || !canSave || !canManage || source) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const operations: ResourceV2MapTransformInput = { terrain_changes: Object.values(terrainEdits), rule_changes: ruleEdits, wave_operations: waveOperations, object_operations: objectOperations };
      const fingerprint = JSON.stringify({ source: version.public_id, operations });
      if (!saveAttempt.current || saveAttempt.current.fingerprint !== fingerprint) saveAttempt.current = { fingerprint, key: newIdempotencyKey() };
      const blob = await exportResourceWorkbenchMapV2(workbench.resource.public_id, version.public_id, operations);
      if (!blob.size) throw new Error(t('resourceWorkbenchV2.mapEditor.saveFailed'));
      const file = new File([blob], fileName(version), { type: 'application/octet-stream' });
      const draft = await createResourceDirectVersionDraft(workbench.resource.public_id, {
        version: version.version,
        version_mode: version.version_mode === 'compatibility' ? 'compatibility' : 'semver',
        release_channel: ['release', 'beta', 'alpha', 'snapshot'].includes(version.release_channel) ? version.release_channel as 'release' | 'beta' | 'alpha' | 'snapshot' : 'release',
        ...(version.game_version_min ? { game_version_min: version.game_version_min } : {}),
        ...(version.game_version_max ? { game_version_max: version.game_version_max } : {}),
      }, saveAttempt.current.key);
      if (draft.draft_status !== 'completed') await uploadResourceDirectDraft(draft.version_public_id, file);
      await onSaved?.(draft.version_public_id);
      saveAttempt.current = null; setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.mapEditor.saveFailed')); }
    finally { setBusy(false); }
  };

  if (!canEdit) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.ownerOnly')}</p>;
  if (!version || version.status !== 'published') return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.publishedOnly')}</p>;

  return <div className="min-w-0 space-y-4" onKeyDown={event => { if (busy) return; history.onKeyDown(event); if (event.key === 'Delete' && selectedObject && !(event.target as HTMLElement).closest('input,textarea,select')) queueObjectChanges(selectedObject.type, selectedObject.item, [{ action: 'delete', object_type: selectedObject.type, x: selectedObject.item.x, y: selectedObject.item.y }]); }} >
    <p className="text-sm leading-6 text-[var(--text-secondary)]">修改地形、规则、波次和建筑后下载 .msav。发布或保存为新版本需要审核，原地图保持不变。</p>
    {loading ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.loading')}</p> : null}
    {loadError ? <p role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{loadError}</p> : null}
    {editor ? <>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !history.canUndo} onClick={history.undo} className="min-h-11 border border-[var(--border)] px-3 text-sm">撤销</button><button type="button" disabled={busy || !history.canRedo} onClick={history.redo} className="min-h-11 border border-[var(--border)] px-3 text-sm">重做</button></div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="地图编辑器工具页">
        {([['terrain', '地形'], ['rules', '规则'], ['waves', '波次'], ['objects', '地图对象']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={`min-h-11 shrink-0 border px-4 text-sm ${tab === key ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>{label}</button>)}
      </nav>

      {tab === 'terrain' || tab === 'objects' ? <section className="space-y-3 border border-[var(--border)] p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="地形"><ContentPicker type="block" value={floorChoice} filter={item => item.category === 'floor'} onChange={name => setFloorChoice(name)} disabled={busy} label="选择地形" /></Field>
          <Field label="矿物与覆盖层"><ContentPicker type="block" value={overlayChoice} filter={item => item.category === 'overlay' || item.name === 'air'} onChange={name => setOverlayChoice(name)} disabled={busy} label="选择矿物" /></Field>
          <Field label="画笔大小"><select value={brushSize} onChange={event => setBrushSize(Number(event.target.value) as 1 | 3 | 5)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3"><option value={1}>1×1</option><option value={3}>3×3</option><option value={5}>5×5</option></select></Field>
          <Field label="绘制图层"><select value={paintLayer} onChange={event => setPaintLayer(event.target.value as typeof paintLayer)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3"><option value="floor">只改地形</option><option value="overlay">只改矿物</option><option value="both">地形与矿物</option></select></Field>
        </div>
        <div className="flex flex-wrap gap-2">{([['paint', '画笔'], ['erase', '橡皮擦'], ['rectangle', '矩形'], ['fill', '填充'], ['select', '框选'], ['paste', '粘贴'], ['pan', '平移画布']] as const).map(([key, label]) => <button key={key} type="button" disabled={busy || key === 'paste' && !clipboard.length} aria-pressed={terrainTool === key} onClick={() => setTerrainTool(key)} className="min-h-11 border border-[var(--border)] px-3 text-sm">{label}</button>)}<button type="button" disabled={!selection} onClick={copyRegion} className="min-h-11 border border-[var(--border)] px-3 text-sm">复制区域</button><button type="button" disabled={!Object.keys(terrainEdits).length || busy} onClick={() => { history.remember(); setTerrainEdits({}); }} className="min-h-11 border border-[var(--border)] px-3 text-sm">清空地形改动</button></div>
        <div className="flex flex-wrap gap-3">{[['网格', showGrid, setShowGrid], ['建筑', showObjects, setShowObjects], ['核心及出生点', showCoreSpawns, setShowCoreSpawns]].map(([label, value, setter]) => <label key={String(label)} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value)} onChange={event => (setter as (value: boolean) => void)(event.target.checked)} />{String(label)}</label>)}</div>
        {largeMap ? <div className="space-y-2 border border-amber-500/30 p-3 text-sm"><p>分区编辑模式：每区最多 128×128 格，避免大地图卡顿。</p><div className="flex flex-wrap gap-2"><Field label="横向分区"><select value={partition.x} onChange={event => setPartition(current => ({ ...current, x: Number(event.target.value) }))} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-2">{Array.from({ length: Math.ceil(editor.width / 128) }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></Field><Field label="纵向分区"><select value={partition.y} onChange={event => setPartition(current => ({ ...current, y: Number(event.target.value) }))} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-2">{Array.from({ length: Math.ceil(editor.height / 128) }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></Field></div>{!regionComplete ? <p>此分区的数据不完整，不能涂画。规则与波次仍可编辑。</p> : null}</div> : null}
        <EditorCanvas width={viewWidth} height={viewHeight} zoom={zoom} setZoom={setZoom} label={t('resourceWorkbenchV2.mapEditor.canvas')} pan={terrainTool === 'pan'} onPoint={(point) => {
          if (busy || tab === 'objects' && editor.objectsTruncated) return;
          const target = { x: point.x + region.x, y: point.y + region.y }; setCoordinate(target);
          if (tab === 'objects') { const found = objectAt(target); setSelectedObject(found || null); setNewObjectX(target.x); setNewObjectY(target.y); return; }
          if (terrainTool === 'fill') changeRegion(target, target, true); else if (terrainTool === 'paste') pasteRegion(target); else if (terrainTool === 'select') setSelection({ from: target, to: target }); else if (regionComplete) paintCell(target.x, target.y, true);
        }} onDrag={(from, to, _event, path) => {
          if (busy || tab === 'objects' && editor.objectsTruncated) return;
          const a = { x: from.x + region.x, y: from.y + region.y }, b = { x: to.x + region.x, y: to.y + region.y };
          setCoordinate(b);
          if (tab === 'objects') { const found = objectAt(a); if (found) { queueObjectChanges(found.type, found.item, [{ action: 'move', object_type: found.type, from_x: found.item.x, from_y: found.item.y, to_x: found.x + b.x-a.x, to_y: found.y + b.y-a.y }]); setSelectedObject(found); } return; }
          if (terrainTool === 'select') setSelection({ from: a, to: b }); else if (regionComplete && terrainTool === 'rectangle') changeRegion(a, b); else if (regionComplete && ['paint', 'erase'].includes(terrainTool)) { const stroke: CanvasPoint[] = []; for (let segment = 1; segment < path.length; segment++) { const start = path[segment-1], end = path[segment]; const steps = Math.max(Math.abs(end.x-start.x), Math.abs(end.y-start.y)); for (let i = 0; i <= steps; i++) stroke.push({ x: region.x + Math.round(start.x+(end.x-start.x)*i/Math.max(1,steps)), y: region.y + Math.round(start.y+(end.y-start.y)*i/Math.max(1,steps)) }); } paintCells(stroke, true); }
        }}>
          <MapTileImage width={viewWidth} height={viewHeight} cells={visibleTerrain} />
          {showGrid ? <><defs><pattern id="map-editor-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#17202a" strokeWidth=".04" /></pattern></defs><rect width={viewWidth} height={viewHeight} fill="url(#map-editor-grid)" /></> : null}
          {visibleObjects.filter(entry => entry.x >= region.x && entry.y >= region.y && entry.x < region.x+viewWidth && entry.y < region.y+viewHeight && (entry.type === 'building' ? showObjects : showCoreSpawns)).map((entry, index) => entry.type === 'spawn' ? <circle key={index} cx={entry.x-region.x+.5} cy={entry.y-region.y+.5} r=".32" fill="#ff6b6b" /> : <rect key={index} x={entry.x-region.x-Math.floor(((entry.item.size || 1)-1)/2)+.08} y={entry.y-region.y-Math.floor(((entry.item.size || 1)-1)/2)+.08} width={(entry.item.size || 1)-.16} height={(entry.item.size || 1)-.16} fill={entry.type === 'core' ? '#7dd3fc' : '#ddd'} fillOpacity=".8" stroke={selectedObject?.item.x === entry.item.x && selectedObject?.item.y === entry.item.y ? '#ffdf70' : '#17202a'} strokeWidth=".12" />)}
        </EditorCanvas>
        <p className="text-xs text-[var(--text-muted)]">{editor.width}×{editor.height} · 当前坐标 {coordinate.x},{coordinate.y} · 已改 {Object.keys(terrainEdits).length} 格 · {tab === 'objects' ? '点击选中对象，拖动移动；空白处设定添加位置' : '选择工具后在画布操作'}</p>
      </section> : null}

      {tab === 'rules' ? <section className="space-y-5 border border-[var(--border)] p-3 sm:p-4">
        <div><h4 className="text-sm font-semibold text-[var(--text)]">游戏规则</h4><p className="mt-1 text-xs text-[var(--text-muted)]">直接对应 Mindustry Rules，导出时由官方读取器再次校验。</p></div>
        {Object.entries(RULE_GROUPS).map(([title, keys]) => <details key={title} open className="border border-[var(--border)]"><summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-semibold">{title}</summary><div className="grid gap-3 border-t border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-3">{keys.map(key => {
          const original = ruleValue(key);
          if (typeof original === 'boolean') return <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy} checked={original} onChange={event => changeRule(key, event.target.checked)} />{RULE_LABELS[key]}</label>;
          if (typeof original === 'number') return <Field key={key} label={RULE_LABELS[key]}><input type="number" min={0} step="any" disabled={busy} value={original} onChange={event => changeRule(key, Number(event.target.value))} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3" /></Field>;
          return null;
        })}</div></details>)}
        <button type="button" onClick={() => setShowAdvancedRules(value => !value)} className="min-h-11 text-sm text-[var(--primary)]">{showAdvancedRules ? '收起高级规则' : '展开高级规则'}</button>
        {showAdvancedRules ? <div className="grid gap-3 sm:grid-cols-2">{[...BOOLEAN_RULES, ...INTEGER_RULES, ...NUMBER_RULES].filter(key => !Object.values(RULE_GROUPS).flat().includes(key)).map(key => { const original = ruleValue(key); return typeof original === 'boolean' ? <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={original} disabled={busy} onChange={event => changeRule(key, event.target.checked)} />{RULE_LABELS[key] || key}</label> : typeof original === 'number' ? <Field key={key} label={RULE_LABELS[key] || key}><input type="number" step="any" disabled={busy} value={original} onChange={event => changeRule(key, Number(event.target.value))} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3" /></Field> : null; })}<Field label="游戏模式名称"><input value={String(ruleValue('modeName') || '')} disabled={busy} onChange={event => changeRule('modeName', event.target.value)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3" /></Field>{['bannedBlocks', 'bannedUnits'].map(key => <Field key={key} label={RULE_LABELS[key]}><textarea value={Array.isArray(ruleValue(key)) ? (ruleValue(key) as string[]).join(', ') : ''} disabled={busy} onChange={event => changeRule(key, event.target.value.split(',').map(v => v.trim()).filter(Boolean))} className="min-h-24 w-full border border-[var(--border)] bg-[var(--bg-card)] p-3" /></Field>)}</div> : null}
      </section> : null}

      {tab === 'waves' ? <WaveEditor history={history} operations={waveOperations} onOperationsReplace={setWaveOperations} groups={waveGroups} disabled={busy} onGroupsChange={(groups) => { history.remember(); setWaveGroups(groups); setSaved(false); }} onOperation={(operation) => { setWaveOperations((current) => [...current, operation]); setSaved(false); setError(''); }} /> : null}

      {tab === 'objects' ? <section className="space-y-4 border border-[var(--border)] p-3 sm:p-4">
        <div><h4 className="text-sm font-semibold text-[var(--text)]">地图对象</h4><p className="mt-1 text-xs text-[var(--text-muted)]">新增、删除、移动核心/出生点/建筑，或为核心和建筑改队伍。保存时由官方 Mindustry MapIO 写入并重新读取校验。</p></div>
        {editor.objectsTruncated ? <p role="alert" className="border border-amber-500/30 p-3 text-sm text-amber-800 dark:text-amber-200">对象列表达到安全展示上限，当前地图对象编辑已关闭，避免修改未显示的对象。</p> : null}
        <div className="grid gap-3 rounded border border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="对象类型"><select value={newObjectType} onChange={(event) => { const value = event.target.value as MapObjectType; setNewObjectType(value); setNewObjectName(editor.catalog[`${value}s` as 'cores' | 'spawns' | 'buildings'][0] || ''); }} disabled={busy || editor.objectsTruncated} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm"><option value="core">核心</option><option value="spawn">敌人出生点</option><option value="building">建筑</option></select></Field>
          <Field label="官方内容"><ContentPicker type="block" value={newObjectName} filter={item => objectChoices.includes(item.name)} onChange={setNewObjectName} disabled={busy || editor.objectsTruncated} label="选择地图对象" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="X"><input type="number" min={0} max={editor.width - 1} value={newObjectX} disabled={editor.objectsTruncated} onChange={(event) => setNewObjectX(Number(event.target.value))} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field><Field label="Y"><input type="number" min={0} max={editor.height - 1} value={newObjectY} disabled={editor.objectsTruncated} onChange={(event) => setNewObjectY(Number(event.target.value))} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field></div>
          {newObjectType !== 'spawn' ? <Field label="队伍"><select value={newObjectTeam} onChange={(event) => setNewObjectTeam(event.target.value)} disabled={busy || editor.objectsTruncated} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm">{editor.catalog.teams.map((team) => <option key={team} value={team}>{TEAM_LABELS[team] || team}</option>)}</select></Field> : null}
          {newObjectType !== 'spawn' ? <Field label="旋转"><select value={newObjectRotation} onChange={(event) => setNewObjectRotation(Number(event.target.value))} disabled={editor.objectsTruncated} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm"><option value={0}>0°</option><option value={1}>90°</option><option value={2}>180°</option><option value={3}>270°</option></select></Field> : null}
          <button type="button" disabled={busy || editor.objectsTruncated || !objectChoices.length || (newObjectType !== 'spawn' && !editor.catalog.teams.length)} onClick={addMapObject} className="min-h-11 self-end border border-[var(--primary)] px-4 text-sm font-medium text-[var(--primary)] disabled:opacity-40">加入地图</button>
        </div>
        {selectedObject ? <div className="border border-[var(--primary)] p-3"><h5 className="mb-2 text-sm font-semibold">选中{OBJECT_LABELS[selectedObject.type]} · {selectedObject.item.x},{selectedObject.item.y}</h5><MapObjectRow key={`${selectedObject.type}:${selectedObject.item.x}:${selectedObject.item.y}`} item={selectedObject.item} objectType={selectedObject.type} teams={editor.catalog.teams} width={editor.width} height={editor.height} busy={busy} pending={false} onApply={next => queueObjectChanges(selectedObject.type, selectedObject.item, next)} /></div> : null}
        <ObjectTable title="核心" objectType="core" items={editor.cores} teams={editor.catalog.teams} width={editor.width} height={editor.height} busy={busy || editor.objectsTruncated} operations={objectOperations} onChange={queueObjectChanges} />
        <ObjectTable title="敌人出生点" objectType="spawn" items={editor.enemySpawns} teams={editor.catalog.teams} width={editor.width} height={editor.height} busy={busy || editor.objectsTruncated} operations={objectOperations} onChange={queueObjectChanges} />
        <ObjectTable title="建筑" objectType="building" items={editor.buildings} teams={editor.catalog.teams} width={editor.width} height={editor.height} busy={busy || editor.objectsTruncated} operations={objectOperations} onChange={queueObjectChanges} />
        <div className="border-t border-[var(--border)] pt-3">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">待保存对象操作：{objectOperations.length}</p><button type="button" disabled={!objectOperations.length || busy} onClick={() => { history.remember(); setObjectOperations([]); }} className="min-h-11 px-3 text-sm text-[var(--primary)]">清空对象改动</button></div>
          {objectOperations.length ? <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">{objectOperations.map((operation, index) => <li key={`${operation.action}:${operation.object_type}:${index}`}>{OBJECT_LABELS[operation.action]} · {OBJECT_LABELS[operation.object_type]} · {operation.action === 'move' ? `${operation.from_x},${operation.from_y} → ${operation.to_x},${operation.to_y}` : operation.action === 'add' ? `${operation.name} @ ${operation.x},${operation.y}` : `${operation.x},${operation.y}`}</li>)}</ul> : null}
        </div>
      </section> : null}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-2 z-10 flex flex-wrap items-center gap-3 border border-[var(--border)] bg-[var(--bg-card)]/95 p-3 shadow-lg backdrop-blur">
        {canManage && !source ? <button type="button" disabled={!canSave} onClick={() => void saveNewVersion()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><Save className="h-4 w-4" />{busy ? t('resourceWorkbenchV2.mapEditor.saving') : '保存为新版本'}</button> : <><input aria-label="发布地图副本名称" value={copyTitle} onChange={event => setCopyTitle(event.target.value)} className="min-h-11 min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm" /><button type="button" disabled={busy || !user} onClick={() => void publishCopy()} className="min-h-11 border border-[var(--primary)] px-3 text-sm text-[var(--primary)] disabled:opacity-40">{user ? '发布为我的资源' : '登录后发布'}</button></>}<button type="button" disabled={busy} onClick={() => void downloadMap()} className="min-h-11 border border-[var(--border)] px-3 text-sm">下载 .msav</button>
        <span className="text-xs text-[var(--text-muted)]">地形 {Object.keys(terrainEdits).length} · 规则 {Object.keys(ruleEdits).length} · 波次 {waveOperations.length} · 对象 {objectOperations.length}</span>
        {saved ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{t('resourceWorkbenchV2.mapEditor.saved')}</span> : null}
      </div>
      {error ? <p role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    </> : null}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-[8rem] flex-1 space-y-1 text-xs text-[var(--text-muted)]"><span className="block">{label}</span>{children}</label>;
}

function ObjectTable({ title, objectType, items, teams, width, height, busy, operations, onChange }: {
  title: string; objectType: MapObjectType; items: MapObject[]; teams: string[]; width: number; height: number; busy: boolean;
  operations: ResourceV2MapObjectOperation[];
  onChange: (type: MapObjectType, item: MapObject, operations: ResourceV2MapObjectOperation[]) => void;
}) {
  return <details open={title !== '建筑'} className="border border-[var(--border)]"><summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium">{title} · {items.length}</summary>
    <div className="max-h-[60vh] space-y-2 overflow-auto border-t border-[var(--border)] p-2">
      {items.map((item, index) => <MapObjectRow key={`${objectType}:${item.x}:${item.y}:${index}`} item={item} objectType={objectType} teams={teams} width={width} height={height} busy={busy}
        pending={operations.some((operation) => operation.action !== 'add' && operation.object_type === objectType
          && (operation.action === 'move' ? operation.from_x === item.x && operation.from_y === item.y : operation.x === item.x && operation.y === item.y))}
        onApply={(next) => onChange(objectType, item, next)} />)}
      {!items.length ? <div className="p-4 text-center text-sm text-[var(--text-muted)]">暂无该类对象</div> : null}
    </div>
  </details>;
}

function MapObjectRow({ item, objectType, teams, width, height, busy, pending, onApply }: {
  item: MapObject; objectType: MapObjectType; teams: string[]; width: number; height: number; busy: boolean; pending: boolean;
  onApply: (operations: ResourceV2MapObjectOperation[]) => void;
}) {
  const [toX, setToX] = useState(item.x);
  const [toY, setToY] = useState(item.y);
  const [team, setTeam] = useState(item.team || teams[0] || '');
  const [rotation, setRotation] = useState(item.rotation || 0);
  const apply = () => {
    const next: ResourceV2MapObjectOperation[] = [];
    if (toX !== item.x || toY !== item.y) next.push({ action: 'move', object_type: objectType, from_x: item.x, from_y: item.y, to_x: toX, to_y: toY });
    if (objectType !== 'spawn' && team && team !== item.team) next.push({ action: 'team', object_type: objectType, x: item.x, y: item.y, team });
    if (objectType !== 'spawn' && rotation !== (item.rotation || 0)) next.push({ action: 'rotate', object_type: objectType, x: item.x, y: item.y, rotation });
    onApply(next);
  };
  return <article className="space-y-2 rounded border border-[var(--border)] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{item.name || objectType}</strong><span className="font-mono text-xs text-[var(--text-muted)]">当前位置 {item.x}, {item.y} · 队伍 {item.team || '—'}{item.size ? ` · ${item.size}×${item.size}` : ''}</span></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Field label="移动到 X"><input type="number" min={0} max={width - 1} value={toX} onChange={(event) => setToX(Number(event.target.value))} disabled={busy} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>
      <Field label="移动到 Y"><input type="number" min={0} max={height - 1} value={toY} onChange={(event) => setToY(Number(event.target.value))} disabled={busy} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>
      {objectType !== 'spawn' ? <Field label="修改队伍"><select value={team} onChange={(event) => setTeam(event.target.value)} disabled={busy} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm">{teams.map((name) => <option key={name} value={name}>{TEAM_LABELS[name] || name}</option>)}</select></Field> : null}
      {objectType !== 'spawn' ? <Field label="方向"><select value={rotation} onChange={event => setRotation(Number(event.target.value))} disabled={busy} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3">{[0,1,2,3].map(value => <option key={value} value={value}>{value * 90}°</option>)}</select></Field> : null}
      <div className="flex flex-wrap items-end gap-2"><button type="button" disabled={busy || (toX === item.x && toY === item.y && (objectType === 'spawn' || team === item.team) && rotation === (item.rotation || 0))} onClick={apply} className="min-h-11 border border-[var(--primary)] px-3 text-sm text-[var(--primary)] disabled:opacity-40">应用</button>
        <button type="button" disabled={busy} onClick={() => onApply([{ action: 'delete', object_type: objectType, x: item.x, y: item.y }])} className="min-h-11 border border-red-500/50 px-3 text-sm text-red-700 dark:text-red-300">删除</button>
        {pending ? <button type="button" disabled={busy} onClick={() => onApply([])} className="min-h-11 px-3 text-sm text-[var(--text-muted)]">撤销待处理</button> : null}</div>
    </div>
  </article>;
}
