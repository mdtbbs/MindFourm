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
  type ResourceV2SchematicBlockPosition,
  type ResourceV2SchematicConfigDescriptor,
  type ResourceV2SchematicConfigValue,
  type ResourceV2SchematicLogicConfig,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
  type ResourceWorkbenchV2VersionAnalysis,
} from '@/lib/api/v1/resources';
import { fetchV1, V1ApiError } from '@/lib/api/v1/transport';
import EditorCanvas from './editor-canvas';
import { useEditorHistory } from './editor-history';
import ContentPicker, { useEditorCatalog } from './content-picker';
import LogicCodeEditor from './logic-code-editor';
import type { EditorSource, EditorContext } from './editor-source';
import { downloadEditorFile } from './editor-source';
import { publishEditorCopy } from './publish-editor-copy';
import { useAuth } from '@/store/user-store';
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
  config?: ResourceV2SchematicConfigValue | ResourceV2SchematicLogicConfig;
  configTypes?: ResourceV2SchematicConfigDescriptor[];
  logicSource?: string;
  logicLinks?: LogicLink[];
};
type BlockGroup = { name: string; displayName: string | null; count: number; placements: Placement[]; size: number };
type SchematicMove = { from_x: number; from_y: number; to_x: number; to_y: number };
type SchematicAddition = { x: number; y: number; block: string; rotation: number; previewSize: number; copy_from_x?: number; copy_from_y?: number; config?: ResourceV2SchematicConfigValue; logic_source?: string };
type EditSnapshot = {
  deleted: string[];
  moves: SchematicMove[];
  additions: SchematicAddition[];
  logicEdits: Record<string, string>;
  configEdits: Record<string, ResourceV2SchematicConfigValue>;
  rotation: number;
  mirrorX: boolean;
};
type Dimensions = { width: number; height: number };

type Tool = 'select' | 'rectangle' | 'move' | 'place' | 'pan';

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
      const config = position.config;
      const logicConfig = config && typeof config === 'object' && 'format_version' in config && config.format_version === 1
        ? config as ResourceV2SchematicLogicConfig : null;
      const source = logicConfig && typeof logicConfig.source === 'string' && position.logic_source_available === true ? logicConfig.source : undefined;
      const links = logicConfig && Array.isArray(logicConfig.links) ? logicConfig.links.flatMap((raw): LogicLink[] => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
        return typeof raw.name === 'string' && Number.isInteger(raw.x) && Number.isInteger(raw.y) ? [{ name: raw.name, x: raw.x, y: raw.y }] : [];
      }) : undefined;
      const size = Number.isInteger(position.size) && Number(position.size) > 0 ? Math.min(16, Number(position.size)) : 1;
      return [{ key: `${position.x}:${position.y}`, sourceKey: `${position.x}:${position.y}`, x: position.x as number, y: position.y as number,
        rotation: Number.isInteger(position.rotation) ? Number(position.rotation) & 3 : 0, size, block: block.internal_name,
        displayName: block.display_name || block.internal_name,
        ...(config ? { config } : {}), ...(position.config_types?.length ? { configTypes: position.config_types } : {}),
        ...(source !== undefined ? { logicSource: source } : {}), ...(links ? { logicLinks: links } : {}) }];
    });
    if (placements.length !== block.count || placements.length !== positions.length) complete = false;
    total += placements.length;
    return { name: block.internal_name, displayName: block.display_name, count: block.count, placements, size: placements[0]?.size || 1 };
  }).sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name));
  if (total > 10_000) complete = false;
  return { groups, complete, total };
}

const CONTENT_NAME_SUGGESTIONS: Record<string, string[]> = {
  item: ['copper', 'lead', 'metaglass', 'graphite', 'sand', 'coal', 'titanium', 'thorium', 'scrap', 'silicon', 'plastanium', 'phase-fabric', 'surge-alloy', 'spore-pod', 'blast-compound', 'pyratite', 'beryllium', 'tungsten', 'oxide', 'carbide', 'fissile-matter', 'dormant-cyst'],
  liquid: ['water', 'slag', 'oil', 'cryofluid', 'gallium', 'ozone', 'hydrogen', 'nitrogen', 'cyanogen', 'arkycite'],
  unit: ['alpha', 'beta', 'gamma', 'dagger', 'mace', 'fortress', 'scepter', 'reign', 'nova', 'pulsar', 'quasar', 'vela', 'corvus', 'flare', 'horizon', 'zenith', 'antumbra', 'mono', 'poly', 'mega', 'quad', 'oct'],
  block: [], unitCommand: ['move', 'repair', 'rebuild', 'assist', 'mine', 'enterPayload', 'loadUnits', 'loadBlocks', 'unloadPayload', 'loopPayload'],
  status: [], planet: [], weather: [],
};

function defaultConfigForDescriptor(descriptor: ResourceV2SchematicConfigDescriptor): ResourceV2SchematicConfigValue | null {
  switch (descriptor.type) {
    case 'none': return { type: 'none' };
    case 'integer': return { type: 'integer', value: 0 };
    case 'long': return { type: 'long', value: '0' };
    case 'float': return { type: 'float', value: 0 };
    case 'double': return { type: 'double', value: 0 };
    case 'boolean': return { type: 'boolean', value: false };
    case 'text': return { type: 'text', value: '' };
    case 'content': return descriptor.content_type ? { type: 'content', content_type: descriptor.content_type, name: '' } : null;
    case 'tech_node': return { type: 'tech_node', content_type: 'item', name: '' };
    case 'point': return { type: 'point', x: 0, y: 0 };
    case 'point_array': return { type: 'point_array', points: [] };
    case 'int_seq': return { type: 'int_seq', values: [] };
    case 'int_array': return { type: 'int_array', values: [] };
    case 'boolean_array': return { type: 'boolean_array', values: [] };
    case 'vec2': return { type: 'vec2', x: 0, y: 0 };
    case 'vec2_array': return { type: 'vec2_array', points: [] };
    case 'team': return { type: 'team', name: 'sharded' };
    case 'l_access': return { type: 'l_access', name: 'health' };
    case 'unit_command': return { type: 'unit_command', name: 'move' };
    case 'color': return { type: 'color', value: '#ffffffff' };
    default: return null;
  }
}

function SchematicConfigEditor({ value, configTypes, disabled, onChange, onBeginEdit }: {
  value: ResourceV2SchematicConfigValue | null;
  configTypes: ResourceV2SchematicConfigDescriptor[];
  disabled: boolean;
  onChange: (next: ResourceV2SchematicConfigValue) => void;
  onBeginEdit: () => void;
}) {
  const selectedType = value?.type || '';
  const available = configTypes.filter((entry) => entry.type !== 'logic');
  const inputClass = 'min-h-11 w-full min-w-0 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base text-[var(--text)] sm:text-sm';
  const change = (next: ResourceV2SchematicConfigValue) => { onBeginEdit(); onChange(next); };
  const selectedDescriptor = available.find((entry) => entry.type === selectedType);
  return <div className="space-y-3">
    <label className="block space-y-1 text-xs text-[var(--text-muted)]"><span>官方配置类型</span><select disabled={disabled} value={selectedType} onChange={(event) => {
      const descriptor = available.find((entry) => entry.type === event.target.value);
      const next = descriptor ? defaultConfigForDescriptor(descriptor) : null;
      if (next) change(next);
    }} className={inputClass}>
      {!selectedType ? <option value="">选择可用配置</option> : null}
      {available.map((entry, index) => <option key={`${entry.type}:${entry.content_type || ''}:${index}`} value={entry.type}>{({ none: '无配置', integer: '整数', long: '长整数', float: '小数', double: '小数', boolean: '开关', text: '文本', content: '游戏内容', tech_node: '科技节点', point: '坐标引用', point_array: '坐标引用列表', int_seq: '数值列表', int_array: '数值列表', boolean_array: '开关列表', vec2: '二维坐标', vec2_array: '二维坐标列表', color: '颜色', team: '队伍', unit_command: '单位指令', l_access: '逻辑访问字段' } as Record<string,string>)[entry.type] || entry.type}</option>)}
    </select></label>
    {value?.type === 'none' ? <p className="text-sm text-[var(--text-muted)]">此方块不携带额外配置。</p> : null}
    {value?.type === 'integer' || value?.type === 'long' || value?.type === 'float' || value?.type === 'double' ? <label className="block space-y-1 text-xs text-[var(--text-muted)]"><span>数值</span><input type="number" step={value.type === 'integer' || value.type === 'long' ? 1 : 'any'} disabled={disabled} value={value.value} onChange={(event) => change(value.type === 'long' ? { ...value, value: event.target.value } : { ...value, value: Number(event.target.value) || 0 })} className={inputClass} /></label> : null}
    {value?.type === 'color' ? <label className="block space-y-1 text-xs text-[var(--text-muted)]"><span>RGBA 颜色（#RRGGBBAA）</span><input disabled={disabled} value={value.value} maxLength={9} onChange={(event) => change({ ...value, value: event.target.value })} className={inputClass} /></label> : null}
    {value?.type === 'boolean' ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={disabled} checked={value.value} onChange={(event) => change({ ...value, value: event.target.checked })} className="h-5 w-5" />启用</label> : null}
    {value?.type === 'text' ? <label className="block space-y-1 text-xs text-[var(--text-muted)]"><span>文本</span><textarea maxLength={1200} disabled={disabled} value={value.value} onChange={(event) => change({ ...value, value: event.target.value })} className={`${inputClass} min-h-24 py-2`} /></label> : null}
    {value?.type === 'content' || value?.type === 'tech_node' ? <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
      {value.type === 'tech_node' ? <select disabled={disabled} value={value.content_type} onChange={(event) => change({ ...value, content_type: event.target.value })} className={inputClass}>{['item', 'block', 'unit', 'liquid', 'status', 'planet'].map((kind) => <option key={kind}>{kind}</option>)}</select> : <span className="flex min-h-11 items-center border border-[var(--border)] px-3 text-sm text-[var(--text-muted)]">{value.content_type}</span>}
      <ContentPicker type={value.content_type} value={value.name} disabled={disabled} onChange={name => change({ ...value, name })} label="选择配置内容" />
    </div> : null}
    {value?.type === 'point' || value?.type === 'vec2' ? <div className="grid grid-cols-2 gap-2">{(['x', 'y'] as const).map((axis) => <label key={axis} className="block space-y-1 text-xs text-[var(--text-muted)]"><span>{axis === 'x' ? 'X 偏移' : 'Y 偏移'}</span><input type="number" min={value.type === 'point' ? -127 : 0} max={127} step="any" disabled={disabled} value={value[axis]} onChange={(event) => change({ ...value, [axis]: Number(event.target.value) || 0 })} className={inputClass} /></label>)}</div> : null}
    {value?.type === 'point_array' || value?.type === 'vec2_array' ? <div className="space-y-2">{value.points.map((point, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2"><input aria-label={`链接 ${index + 1} X`} type="number" min={value.type === 'point_array' ? -127 : 0} max={127} step="any" disabled={disabled} value={point.x} onChange={(event) => { const points = value.points.map((entry, itemIndex) => itemIndex === index ? { ...entry, x: Number(event.target.value) || 0 } : entry); change({ ...value, points }); }} className={inputClass} /><input aria-label={`链接 ${index + 1} Y`} type="number" min={value.type === 'point_array' ? -127 : 0} max={127} step="any" disabled={disabled} value={point.y} onChange={(event) => { const points = value.points.map((entry, itemIndex) => itemIndex === index ? { ...entry, y: Number(event.target.value) || 0 } : entry); change({ ...value, points }); }} className={inputClass} /><button type="button" disabled={disabled} aria-label={`删除链接 ${index + 1}`} onClick={() => change({ ...value, points: value.points.filter((_entry, itemIndex) => itemIndex !== index) })} className="min-h-11 border border-[var(--border)]">×</button></div>)}<button type="button" disabled={disabled} onClick={() => change({ ...value, points: [...value.points, { x: 0, y: 0 }] })} className="min-h-11 border border-[var(--border)] px-3 text-sm">添加坐标引用</button><p className="text-xs text-[var(--text-muted)]">保存时 Renderer 会按该方块位置检查引用是否落在蓝图边界内。</p></div> : null}
    {value?.type === 'int_seq' || value?.type === 'int_array' ? <div className="space-y-2">{value.values.map((number, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2"><input type="number" min={-16384} max={16383} disabled={disabled} value={number} onChange={(event) => change({ ...value, values: value.values.map((entry, itemIndex) => itemIndex === index ? Number(event.target.value) || 0 : entry) })} className={inputClass} /><button type="button" disabled={disabled} onClick={() => change({ ...value, values: value.values.filter((_entry, itemIndex) => itemIndex !== index) })} className="min-h-11 border border-[var(--border)]">×</button></div>)}<button type="button" disabled={disabled} onClick={() => change({ ...value, values: [...value.values, 0] })} className="min-h-11 border border-[var(--border)] px-3 text-sm">添加数值</button></div> : null}
    {value?.type === 'boolean_array' ? <div className="space-y-2">{value.values.map((flag, index) => <label key={index} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={disabled} checked={flag} onChange={(event) => change({ ...value, values: value.values.map((entry, itemIndex) => itemIndex === index ? event.target.checked : entry) })} className="h-5 w-5" />值 {index + 1}<button type="button" disabled={disabled} onClick={() => change({ ...value, values: value.values.filter((_entry, itemIndex) => itemIndex !== index) })} className="ml-auto min-h-11 border border-[var(--border)] px-3">删除</button></label>)}<button type="button" disabled={disabled} onClick={() => change({ ...value, values: [...value.values, false] })} className="min-h-11 border border-[var(--border)] px-3 text-sm">添加布尔值</button></div> : null}
    {value?.type === 'team' || value?.type === 'unit_command' || value?.type === 'l_access' ? <label className="block space-y-1 text-xs text-[var(--text-muted)]"><span>{value.type === 'team' ? '队伍' : value.type === 'unit_command' ? '单位指令' : '逻辑访问字段'}</span>{value.type === 'team' || value.type === 'unit_command' ? <select disabled={disabled} value={value.name} onChange={(event) => change({ ...value, name: event.target.value })} className={inputClass}>{(value.type === 'team' ? ['sharded', 'crux', 'malis', 'green', 'blue', 'neoplastic', 'derelict'] : CONTENT_NAME_SUGGESTIONS.unitCommand).map((name) => <option key={name}>{name}</option>)}</select> : <input list="logic-access-values" disabled={disabled} value={value.name} onChange={(event) => change({ ...value, name: event.target.value })} className={inputClass} />}{value.type === 'l_access' ? <datalist id="logic-access-values">{['health', 'maxHealth', 'x', 'y', 'team', 'type', 'rotation', 'enabled', 'progress', 'efficiency', 'memoryCapacity', 'bufferSize', 'color', 'building'].map((name) => <option key={name} value={name} />)}</datalist> : null}</label> : null}
  </div>;
}

function suggestedFilename(version: ResourceWorkbenchV2Version) {
  const sourceName = version.files.find((file) => file.role === 'primary')?.original_filename || version.files[0]?.original_filename || 'schematic.msch';
  return `${sourceName.split(/[\\/]/).pop()?.replace(/\.msch$/i, '') || 'schematic'}-edited.msch`;
}

function footprint(placement: Pick<Placement, 'x' | 'y' | 'size'>) {
  const offset = -Math.floor((placement.size - 1) / 2);
  return { left: placement.x + offset, bottom: placement.y + offset, right: placement.x + offset + placement.size, top: placement.y + offset + placement.size };
}

export default function SchematicLightEditor({ workbench, version, canEdit, canManage = canEdit, source, onSaved }: {
  workbench: EditorContext;
  version: ResourceWorkbenchV2Version | null;
  canEdit: boolean;
  canManage?: boolean;
  source?: EditorSource;
  onSaved?: (versionPublicId: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { items: catalog } = useEditorCatalog();
  const [advanced, setAdvanced] = useState(false);
  const [clipboard, setClipboard] = useState<Placement[]>([]);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [copyTitle, setCopyTitle] = useState(`${workbench.resource.title} · 编辑版`);
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
  const [configEdits, setConfigEdits] = useState<Record<string, ResourceV2SchematicConfigValue>>({});
  const [tool, setTool] = useState<Tool>('select');
  const [moveAnchor, setMoveAnchor] = useState<string | null>(null);
  const [paletteBlock, setPaletteBlock] = useState('');
  const [paletteSearch, setPaletteSearch] = useState('');
  const [customBlock, setCustomBlock] = useState('');
  const [customSize, setCustomSize] = useState(1);
  const [placementRotation, setPlacementRotation] = useState(0);
  const [zoom, setZoom] = useState(18);

  const [rotation, setRotation] = useState(0);
  const [mirrorX, setMirrorX] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [analysis, setAnalysis] = useState<ResourceWorkbenchV2VersionAnalysis | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionSaved, setVersionSaved] = useState(false);
  const copyAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const saveAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const snapshot: EditSnapshot = { deleted: [...deleted], moves, additions, logicEdits, configEdits, rotation, mirrorX };
  const history = useEditorHistory(snapshot, previous => {
    setDeleted(new Set(previous.deleted)); setMoves(previous.moves); setAdditions(previous.additions);
    setLogicEdits(previous.logicEdits); setConfigEdits(previous.configEdits); setRotation(previous.rotation); setMirrorX(previous.mirrorX);
    setSelected(new Set()); setMoveAnchor(null); invalidatePreview();
  });
  const { reset: resetHistory } = history;
  const translateRef = useRef(t); translateRef.current = t;
  const versionPublicId = version?.public_id;
  const versionStatus = version?.status;

  useEffect(() => {
    setGroups([]); setDimensions(null); setSelected(new Set()); setDeleted(new Set()); setMoves([]); setAdditions([]); setLogicEdits({}); setConfigEdits({}); resetHistory();
    setTool('select'); setMoveAnchor(null); setPaletteBlock(''); setRotation(0); setMirrorX(false); setPlacementRotation(0);
    setAnalysis(null); setDownloaded(false); setVersionSaved(false); setActionError(''); setLoadError(''); saveAttempt.current = null;
    if (!canEdit || !versionPublicId || versionStatus !== 'published') { setComplete(false); setTotal(0); return; }
    let active = true; setLoading(true);
    void (async () => {
      if (source) {
        const normalized = makeGroups(source.blocks); const size = readDimensions(source.metadata);
        if (!size) throw new Error('蓝图尺寸超出安全编辑范围');
        if (active) { setDimensions(size); setGroups(normalized.groups); setPaletteBlock(normalized.groups[0]?.name || ''); setComplete(normalized.complete); setTotal(normalized.total); }
        return;
      }
      const query = new URLSearchParams({ version_public_id: versionPublicId });
      const detail = await fetchV1<{ version_public_id: string | null; schematic?: Record<string, unknown> | null }>(`/resources/schematics/${encodeURIComponent(workbench.resource.public_id)}?${query.toString()}`);
      const selectedDimensions = readDimensions(detail.schematic);
      if (!selectedDimensions || detail.version_public_id !== versionPublicId) {
        const legacy = await fetchV1<{ metadata: Record<string, unknown>; blocks: ResourceV2SchematicBlock[] }>(`/resources/${encodeURIComponent(workbench.resource.public_id)}/versions/${encodeURIComponent(versionPublicId)}/editor-data`);
        const size = readDimensions(legacy.metadata); if (!size) throw new Error(translateRef.current('resourceWorkbenchV2.schematicEditor.loadFailed'));
        const parsed = makeGroups(legacy.blocks); if (active) { setDimensions(size); setGroups(parsed.groups); setComplete(parsed.complete); setTotal(parsed.total); setPaletteBlock(parsed.groups[0]?.name || ''); } return;
      }
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
    })().catch(() => { if (active) setLoadError(translateRef.current('resourceWorkbenchV2.schematicEditor.loadFailed')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canEdit, resetHistory, source, versionPublicId, versionStatus, workbench.resource.public_id]);

  const paletteGroups = useMemo(() => groups.filter((group) => !paletteSearch.trim() || `${group.displayName || ''} ${group.name}`.toLowerCase().includes(paletteSearch.trim().toLowerCase())), [groups, paletteSearch]);
  const moveBySource = useMemo(() => new Map(moves.map((move) => [`${move.from_x}:${move.from_y}`, move])), [moves]);
  const visiblePlacements = useMemo(() => {
    const result: Placement[] = [];
    for (const group of groups) for (const placement of group.placements) {
      if (deleted.has(placement.key)) continue;
      const move = moveBySource.get(placement.key);
      result.push(move ? { ...placement, x: move.to_x, y: move.to_y } : placement);
    }
    for (const item of additions) {
      const original = groups.flatMap(g => g.placements).find(p => p.x === item.copy_from_x && p.y === item.copy_from_y);
      const metadata = catalog.find(entry => entry.type === 'block' && entry.name === item.block);
      result.push({ ...original, key: `added:${item.x}:${item.y}:${item.block}:${item.rotation}`, sourceKey: original?.sourceKey, x: item.x, y: item.y, rotation: item.rotation, size: item.previewSize, block: item.block, displayName: metadata?.label || item.block,
        config: item.config || original?.config, logicSource: item.logic_source ?? original?.logicSource ?? (metadata?.config_types?.some(type => type.type === 'logic') ? '' : undefined), configTypes: original?.configTypes || metadata?.config_types });
    }
    return result;
  }, [additions, catalog, deleted, groups, moveBySource]);

  const logicConfigEdits = useMemo(() => groups.flatMap((group) => group.placements.flatMap((placement) => {
    const source = logicEdits[placement.key];
    return source !== undefined && source !== placement.logicSource ? [{ x: placement.x, y: placement.y, source }] : [];
  })), [groups, logicEdits]);
  const typedConfigEdits = useMemo(() => groups.flatMap((group) => group.placements.flatMap((placement) => {
    const config = configEdits[placement.key];
    const original = placement.config && placement.config.type !== 'logic' ? placement.config : null;
    if (!config || JSON.stringify(config) === JSON.stringify(original)) return [];
    const [x, y] = (placement.sourceKey || placement.key).split(':').map(Number);
    return [{ x, y, config }];
  })), [configEdits, groups]);
  const hasEdits = rotation !== 0 || mirrorX || deleted.size > 0 || moves.length > 0 || additions.length > 0 || logicConfigEdits.length > 0 || typedConfigEdits.length > 0;
  const canExport = Boolean(canEdit && version?.status === 'published' && complete && !loading && !busy );
  const canvasDimensions = dimensions ? rotation % 2 ? { width: dimensions.height, height: dimensions.width } : dimensions : { width: 1, height: 1 };
  const canvasPlacements = visiblePlacements.map(placement => {
    let x = placement.x, y = placement.y, width = dimensions?.width || 1, height = dimensions?.height || 1;
    const even = placement.size % 2 === 0 ? 1 : 0;
    for (let turn = 0; turn < rotation; turn++) { const oldX = x; x = height-1-y-even; y = oldX; [width, height] = [height, width]; }
    if (mirrorX) x = width-1-x-even;
    return { ...placement, x, y, rotation: mirrorX ? (2-placement.rotation-rotation+8)%4 : (placement.rotation+rotation)%4 };
  });
  const sourcePoint = (point: { x: number; y: number }) => {
    let { x, y } = point, width = canvasDimensions.width, height = canvasDimensions.height;
    if (mirrorX) x = width-1-x;
    for (let turn = 0; turn < rotation; turn++) { const oldX = x; x = y; y = width-1-oldX; [width, height] = [height, width]; }
    return { x, y };
  };
  const selectedPlacements = useMemo(() => visiblePlacements.filter((placement) => selected.has(placement.key)), [selected, visiblePlacements]);
  const selectedLogicPlacement = selectedPlacements.find((placement) => placement.logicSource !== undefined);
  const selectedConfigPlacement = selectedPlacements.find((placement) => ((placement.configTypes?.length || 0) > 0 || (placement.config && placement.config.type !== 'logic')));

  const invalidatePreview = () => { setAnalysis(null); setDownloaded(false); setVersionSaved(false); setActionError(''); };
  const rememberEdit = history.remember;
  const undoLast = history.undo;

  const occupantAt = (x: number, y: number) => visiblePlacements.find((placement) => {
    const box = footprint(placement); return x >= box.left && x < box.right && y >= box.bottom && y < box.top;
  });

  const handleCell = (x: number, y: number, additive = false) => {
    const occupant = occupantAt(x, y);
    setCursor({ x, y });
    if (tool === 'select' || tool === 'rectangle') {
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
      if (!anchor) return;
      const dx = x - anchor.x; const dy = y - anchor.y;
      const sources = selectedPlacements;
      if (!validatePlacements(sources.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })), new Set(sources.map(p => p.key)))) return;
      rememberEdit();
      setAdditions(current => current.map(item => sources.some(p => p.key === `added:${item.x}:${item.y}:${item.block}:${item.rotation}`) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
      setMoves((current) => {
        const originalSources = sources.filter(p => !p.key.startsWith('added:'));
        const movingKeys = new Set(originalSources.map((placement) => placement.sourceKey || placement.key));
        const retained = current.filter((move) => !movingKeys.has(`${move.from_x}:${move.from_y}`));
        return [...retained, ...originalSources.map((placement) => {
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
      if (!block) { setActionError('请先选择方块'); return; }
      const box = footprint({ x, y, size: previewSize });
      if (!validatePlacements([{ x, y, size: previewSize }])) return;
      rememberEdit(); setAdditions((current) => [...current, { x, y, block, rotation: placementRotation, previewSize }]); invalidatePreview();
    }
  };

  const deleteSelected = () => {
    if (!selected.size) return; rememberEdit();
    const addedKeys = new Set([...selected].filter((key) => key.startsWith('added:')));
    const sourceKeys = [...selected].filter((key) => !key.startsWith('added:'));
    setDeleted((current) => new Set([...current, ...sourceKeys]));
    setMoves(current => current.filter(move => !sourceKeys.includes(`${move.from_x}:${move.from_y}`)));
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
    add_blocks: additions.map(({ previewSize: _size, ...item }) => item),
    logic_configs: logicConfigEdits,
    config_edits: typedConfigEdits,
  });

  const validatePlacements = (items: Array<{ x: number; y: number; size: number }>, ignored = new Set<string>()) => {
    const boxes = visiblePlacements.filter(p => !ignored.has(p.key)).map(footprint);
    for (const item of items) {
      const box = footprint(item);
      if (!dimensions || box.left < 0 || box.bottom < 0 || box.right > dimensions.width || box.top > dimensions.height) { setActionError('方块超出蓝图边界，请换一个位置'); return false; }
      if (boxes.some(other => box.left < other.right && box.right > other.left && box.bottom < other.top && box.top > other.bottom)) { setActionError('这里已有方块，不能覆盖。请移动到空白位置'); return false; }
      boxes.push(box);
    }
    return true;
  };
  const copySelected = () => { if (!selectedPlacements.length) return; setClipboard(selectedPlacements.map(p => ({ ...p, ...(p.sourceKey && logicEdits[p.sourceKey] !== undefined ? { logicSource: logicEdits[p.sourceKey] } : {}), ...(p.sourceKey && configEdits[p.sourceKey] ? { config: configEdits[p.sourceKey] } : {}) }))); setActionError(''); };
  const pasteSelected = () => {
    if (!clipboard.length) return;
    const minX = Math.min(...clipboard.map(p => p.x)), minY = Math.min(...clipboard.map(p => p.y));
    const next = clipboard.map(p => ({ x: cursor.x + p.x - minX, y: cursor.y + p.y - minY, block: p.block, rotation: p.rotation, previewSize: p.size, ...(p.config && p.config.type !== 'logic' ? { config: p.config as ResourceV2SchematicConfigValue } : {}), ...(p.logicSource !== undefined ? { logic_source: p.logicSource } : {}),
      ...(p.sourceKey ? { copy_from_x: Number(p.sourceKey.split(':')[0]), copy_from_y: Number(p.sourceKey.split(':')[1]) } : {}) }));
    if (!validatePlacements(next.map(p => ({ ...p, size: p.previewSize })))) return;
    rememberEdit(); setAdditions(current => [...current, ...next]); invalidatePreview();
  };
  const rotateSelected = () => {
    if (!selectedPlacements.length) return; rememberEdit();
    const originals = selectedPlacements.filter(p => p.sourceKey && !p.key.startsWith('added:'));
    setDeleted(current => new Set([...current, ...originals.map(p => p.sourceKey!)]));
    setMoves(current => current.filter(move => !originals.some(p => p.sourceKey === `${move.from_x}:${move.from_y}`)));
    setAdditions(current => [...current.filter(item => !selectedPlacements.some(p => p.key === `added:${item.x}:${item.y}:${item.block}:${item.rotation}`)), ...selectedPlacements.map(p => ({ x: p.x, y: p.y, block: p.block, rotation: (p.rotation + 1) % 4, previewSize: p.size, ...(p.config && p.config.type !== 'logic' ? { config: (p.sourceKey ? configEdits[p.sourceKey] : undefined) || p.config as ResourceV2SchematicConfigValue } : {}), ...(p.logicSource !== undefined ? { logic_source: (p.sourceKey ? logicEdits[p.sourceKey] : undefined) ?? p.logicSource } : {}), ...(p.sourceKey ? { copy_from_x: Number(p.sourceKey.split(':')[0]), copy_from_y: Number(p.sourceKey.split(':')[1]) } : {}) }))]);
    setSelected(new Set()); invalidatePreview();
  };
  const exportBlob = () => source ? source.exportFile(transformPayload()) : exportResourceWorkbenchSchematicV2(workbench.resource.public_id, version!.public_id, transformPayload());
  const publishCopy = async () => {
    if (!canExport || !copyTitle.trim()) return; const fingerprint = JSON.stringify([version?.public_id, copyTitle, transformPayload()]); if (copyAttempt.current?.fingerprint !== fingerprint) copyAttempt.current = { fingerprint, key: crypto.randomUUID() }; setBusy(true); setActionError('');
    try { const file = new File([await exportBlob()], suggestedFilename(version!), { type: 'application/octet-stream' });
      if (source) await source.publishFile(file, copyTitle); else { const draft = await publishEditorCopy(file, 'schematic', copyTitle, workbench.resource.public_id, copyAttempt.current!.key); window.location.assign(`/resources/${draft.resource_public_id}/workbench`); }
    } catch (error) { setActionError(error instanceof Error ? error.message : '发布失败，请重试'); } finally { setBusy(false); }
  };

  const exportAndReanalyze = async () => {
    if (!version || !canExport) return;
    setBusy(true); setActionError(''); setAnalysis(null); setDownloaded(false);
    try {
      const blob = await exportBlob();
      if (!blob.size) throw new Error(t('resourceWorkbenchV2.schematicEditor.exportFailed'));
      const file = new File([blob], suggestedFilename(version), { type: 'application/octet-stream' });
      if (!canManage || source) { downloadEditorFile(blob, file.name); setDownloaded(true); return; }
      const form = new FormData(); form.append('file', file);
      const result = await analyzeResourceWorkbenchVersionV2(workbench.resource.public_id, form);
      if (result.resource_kind !== 'schematic' || !('renderer_metadata' in result.analysis)) throw new Error(t('resourceWorkbenchV2.schematicEditor.reanalysisFailed'));
      setAnalysis(result.analysis);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.rel = 'noopener'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloaded(true);
    } catch (caught) { setActionError(caught instanceof Error && caught.message ? caught.message : t('resourceWorkbenchV2.schematicEditor.exportFailed')); }
    finally { setBusy(false); }
  };

  const saveAsNewVersion = async () => {
    if (!version || !canManage || source || !canExport || savingVersion) return;
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
    } catch (caught) { setActionError(caught instanceof Error && caught.message ? caught.message : t('resourceWorkbenchV2.schematicEditor.saveVersionFailed')); }
    finally { setSavingVersion(false); }
  };

  if (!canEdit) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.ownerOnly')}</p>;
  if (!version) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.noVersion')}</p>;
  if (version.status !== 'published') return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.publishedOnly')}</p>;

  return <div className="min-w-0 space-y-4" onKeyDown={event => {
    history.onKeyDown(event);
    if ((event.target as HTMLElement).closest('input,textarea,select')) return;
    if (event.key === 'Escape') { setSelected(new Set()); setMoveAnchor(null); }
    if (event.key === 'Delete') { event.preventDefault(); deleteSelected(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelected(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelected(); }
  }}>
    <p className="text-sm leading-6 text-[var(--text-secondary)]">选中方块后移动、复制或修改。导出得到 .msch 文件，发布会进入审核，不会覆盖原蓝图。</p>
    {loading ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.loading')}</p> : null}
    {loadError ? <div role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300"><AlertCircle className="mr-2 inline h-4 w-4" />{loadError}</div> : null}

    {complete && dimensions ? <>
      <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!advanced} onClick={() => setAdvanced(false)} className="min-h-11 border border-[var(--border)] px-3 text-sm">简单模式</button><button type="button" aria-pressed={advanced} onClick={() => setAdvanced(true)} className="min-h-11 border border-[var(--border)] px-3 text-sm">高级模式</button></div>
      <section className="space-y-3 border border-[var(--border)] p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">{([['select', '选择'], ['rectangle', '框选'], ['move', '移动'], ['place', '放置'], ['pan', '平移画布']] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={tool === mode} disabled={busy} onClick={() => { setTool(mode); setMoveAnchor(null); }} className={`inline-flex min-h-11 items-center gap-2 border px-4 text-sm ${tool === mode ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)]'}`}>{mode === 'move' ? <Move className="h-4 w-4" /> : null}{label}</button>)}</div>

        {tool === 'place' ? <div className="grid gap-3 border border-[var(--border)] p-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_auto]">
          <div className="space-y-2"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-muted)]" /><input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="搜索当前蓝图里的方块" className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] pl-9 pr-3 text-base sm:text-sm" /></label><select value={paletteBlock} onChange={(event) => { setPaletteBlock(event.target.value); setCustomBlock(''); }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm">{paletteGroups.map((group) => <option key={group.name} value={group.name}>{group.displayName || group.name} · {group.size}×{group.size}</option>)}</select></div>
          {advanced ? <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><input value={customBlock} onChange={(event) => setCustomBlock(event.target.value)} placeholder="高级：方块内部名称" className="min-h-11 min-w-0 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /><input type="number" min={1} max={16} value={customSize} onChange={(event) => setCustomSize(Math.max(1, Math.min(16, Number(event.target.value) || 1)))} aria-label="预览尺寸" className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm" /></div>
          : <ContentPicker type="block" value={paletteBlock} filter={item => !['floor', 'overlay'].includes(item.category)} onChange={(name, item) => { setPaletteBlock(name); setCustomBlock(name); setCustomSize(item?.size || 1); }} label="选择放置方块" />}
          <div className="flex gap-2"><button type="button" onClick={() => setPlacementRotation((value) => (value + 3) % 4)} className="flex h-11 w-11 items-center justify-center border border-[var(--border)]"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={() => setPlacementRotation((value) => (value + 1) % 4)} className="flex h-11 w-11 items-center justify-center border border-[var(--border)]"><RotateCw className="h-4 w-4" /></button><span className="flex min-h-11 items-center px-2 text-xs text-[var(--text-muted)]">{placementRotation * 90}°</span></div>
        </div> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">{selected.size ? <><button type="button" onClick={copySelected} className="min-h-11 border border-[var(--border)] px-3 text-xs">复制</button><button type="button" onClick={rotateSelected} className="min-h-11 border border-[var(--border)] px-3 text-xs">旋转选中</button><button type="button" onClick={selectSameType} className="min-h-11 border border-[var(--border)] px-3 text-xs">选择同类</button><button type="button" onClick={deleteSelected} className="inline-flex min-h-11 items-center gap-2 border border-red-500/40 px-3 text-xs text-red-700 dark:text-red-300"><Trash2 className="h-3.5 w-3.5" />删除 {selected.size}</button></> : <span className="text-xs text-[var(--text-muted)]">点击选择；按住 Ctrl/⌘ 点击可多选。移动工具会整体平移当前选择。</span>}</div>
          <div className="flex items-center gap-1"><button type="button" onClick={() => setZoom((value) => Math.max(8, value - 2))} className="flex h-11 w-11 items-center justify-center border border-[var(--border)]"><ZoomOut className="h-4 w-4" /></button><span className="w-12 text-center text-xs tabular-nums text-[var(--text-muted)]">{zoom}px</span><button type="button" onClick={() => setZoom((value) => Math.min(36, value + 2))} className="flex h-11 w-11 items-center justify-center border border-[var(--border)]"><ZoomIn className="h-4 w-4" /></button></div>
        </div>

        <div className="flex flex-wrap gap-2"><button type="button" disabled={!clipboard.length || busy} onClick={pasteSelected} className="min-h-11 border border-[var(--border)] px-3 text-sm disabled:opacity-40">粘贴到光标位置</button><button type="button" disabled={!history.canUndo || busy} onClick={history.undo} className="min-h-11 border border-[var(--border)] px-3 text-sm disabled:opacity-40">撤销</button><button type="button" disabled={!history.canRedo || busy} onClick={history.redo} className="min-h-11 border border-[var(--border)] px-3 text-sm disabled:opacity-40">重做</button></div>
        <EditorCanvas width={canvasDimensions.width} height={canvasDimensions.height} zoom={zoom} setZoom={setZoom} label="蓝图编辑画布" invertY pan={tool === 'pan'} onPoint={(point, event) => { const original = sourcePoint(point); handleCell(original.x, original.y, event.ctrlKey || event.metaKey || event.shiftKey); }} onDrag={(displayFrom, displayTo, event) => {
          const from = sourcePoint(displayFrom), to = sourcePoint(displayTo);
          if (tool !== 'select' && tool !== 'rectangle') { handleCell(to.x, to.y); return; }
          const picked = visiblePlacements.filter(p => p.x >= Math.min(from.x, to.x) && p.x <= Math.max(from.x, to.x) && p.y >= Math.min(from.y, to.y) && p.y <= Math.max(from.y, to.y));
          setSelected(current => { const next = event.shiftKey || event.ctrlKey || event.metaKey ? new Set(current) : new Set<string>(); for (const p of picked) { if ((event.ctrlKey || event.metaKey) && next.has(p.key)) next.delete(p.key); else next.add(p.key); } return next; });
        }}>
            <defs><pattern id="schematic-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth=".025" /></pattern></defs>
            <rect width={canvasDimensions.width} height={canvasDimensions.height} fill="url(#schematic-grid)" />
            <g transform={`translate(0 ${canvasDimensions.height}) scale(1 -1)`}>
              {canvasPlacements.map((placement) => {
                const index = Math.max(0, groups.findIndex((group) => group.name === placement.block));
                const icon = catalog.find(content => content.type === 'block' && content.name === placement.block)?.icon; const colors = ['#71b7ff', '#84d39a', '#ffc875', '#df9df4', '#ff8e82', '#7bd7d2', '#a7c7e7']; const box = footprint(placement);
                return <g key={placement.key} pointerEvents="none"><rect x={box.left + 0.06} y={box.bottom + 0.06} width={placement.size - 0.12} height={placement.size - 0.12} fill={colors[index % colors.length]} fillOpacity="0.92" stroke={selected.has(placement.key) || moveAnchor === placement.key ? '#fff' : '#17202a'} strokeWidth={selected.has(placement.key) ? '0.12' : '0.06'} />{icon ? <image href={icon} x={box.left} y={box.bottom} width={placement.size} height={placement.size} transform={`translate(0 ${2*box.bottom+placement.size}) scale(1 -1)`} pointerEvents="none" /> : null}<path d={`M ${placement.x + 0.5} ${placement.y + 0.5} l ${placement.rotation === 0 ? 0.28 : placement.rotation === 2 ? -0.28 : 0} ${placement.rotation === 1 ? 0.28 : placement.rotation === 3 ? -0.28 : 0}`} stroke="#111" strokeWidth="0.08" /></g>;
              })}
            </g>
        </EditorCanvas>
        <p className="text-xs text-[var(--text-muted)]">{dimensions.width}×{dimensions.height} · {total} 方块 · 选中 {selected.size} · 光标 {cursor.x},{cursor.y} · {hasEdits ? '有未保存修改' : '原始蓝图'}</p>
      </section>

      {advanced && selectedLogicPlacement ? <section className="space-y-2 border border-[var(--border)] p-3 sm:p-4"><h4 className="text-sm font-semibold text-[var(--text)]">逻辑处理器 · {selectedLogicPlacement.displayName}</h4>{selectedLogicPlacement.logicLinks?.length ? <div className="flex flex-wrap gap-2">{selectedLogicPlacement.logicLinks.map((link, index) => <span key={`${link.name}:${index}`} className="border border-[var(--border)] px-2 py-1 font-mono text-xs">{link.name} → {link.x},{link.y}</span>)}</div> : null}<LogicCodeEditor disabled={busy} value={logicEdits[selectedLogicPlacement.key] ?? selectedLogicPlacement.logicSource ?? ''} onChange={value => { rememberEdit(); if (selectedLogicPlacement.key.startsWith('added:')) setAdditions(current => current.map(item => `added:${item.x}:${item.y}:${item.block}:${item.rotation}` === selectedLogicPlacement.key ? { ...item, logic_source: value } : item)); else setLogicEdits(current => ({ ...current, [selectedLogicPlacement.key]: value })); invalidatePreview(); }} /></section> : null}

      {advanced && selectedConfigPlacement ? <section className="space-y-3 border border-[var(--border)] p-3 sm:p-4"><div><h4 className="text-sm font-semibold text-[var(--text)]">方块配置 · {selectedConfigPlacement.displayName}</h4><p className="mt-1 text-xs text-[var(--text-muted)]">控件只显示此方块在 Mindustry v160.5 注册的安全配置类型；内容名和坐标会由官方解析器再次验证。</p></div><SchematicConfigEditor
        value={configEdits[selectedConfigPlacement.key] ?? (selectedConfigPlacement.config && selectedConfigPlacement.config.type !== 'logic' ? selectedConfigPlacement.config : null)}
        configTypes={selectedConfigPlacement.configTypes || []}
        disabled={busy}
        onBeginEdit={rememberEdit}

        onChange={(next) => { if (selectedConfigPlacement.key.startsWith('added:')) setAdditions(current => current.map(item => `added:${item.x}:${item.y}:${item.block}:${item.rotation}` === selectedConfigPlacement.key ? { ...item, config: next } : item)); else setConfigEdits((current) => ({ ...current, [selectedConfigPlacement.key]: next })); invalidatePreview(); }}
      /></section> : null}

      <section className="flex flex-wrap gap-2 border border-[var(--border)] p-3"><button type="button" disabled={busy} onClick={() => { rememberEdit(); setRotation((value) => (value + 1) % 4); invalidatePreview(); }} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><RotateCcw className="h-4 w-4" />整体左转</button><button type="button" disabled={busy} onClick={() => { rememberEdit(); setRotation((value) => (value + 3) % 4); invalidatePreview(); }} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><RotateCw className="h-4 w-4" />整体右转</button><button type="button" aria-pressed={mirrorX} disabled={busy} onClick={() => { rememberEdit(); setMirrorX((value) => !value); invalidatePreview(); }} className={`inline-flex min-h-11 items-center gap-2 border px-3 text-sm ${mirrorX ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)]'}`}><FlipHorizontal className="h-4 w-4" />水平镜像</button></section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-2 z-10 flex flex-wrap items-center gap-2 border border-[var(--border)] bg-[var(--bg-card)]/95 p-3 shadow-lg backdrop-blur">
        {canManage && !source ? <button type="button" disabled={!canExport || !hasEdits} onClick={() => void saveAsNewVersion()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none"><Save className="h-4 w-4" />{savingVersion ? '保存中…' : '保存为新版本'}</button> : <><input aria-label="发布副本名称" value={copyTitle} onChange={event => setCopyTitle(event.target.value)} className="min-h-11 min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm" /><button type="button" disabled={!canExport || !user} onClick={() => void publishCopy()} className="min-h-11 border border-[var(--primary)] px-3 text-sm text-[var(--primary)] disabled:opacity-40">{user ? '发布为我的资源' : '登录后发布'}</button></>}
        <button type="button" disabled={!canExport} onClick={() => void exportAndReanalyze()} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-4 text-sm disabled:opacity-40"><Download className="h-4 w-4" />{busy ? '处理中…' : '下载 .msch'}</button>
        {versionSaved ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">新版本已提交审核</span> : null}{downloaded ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">已导出</span> : null}
      </div>
      {analysis ? <div className="border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-[var(--text-secondary)]">导出文件已通过官方读写验证。{'renderer_metadata' in analysis && typeof analysis.renderer_metadata?.block_count === 'number' ? <span className="ml-2">解析方块数：{analysis.renderer_metadata.block_count}</span> : null}</div> : null}
      {actionError ? <div role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{actionError}</div> : null}
    </> : null}

    {!loading && !loadError && groups.length > 0 && !complete ? <div role="alert" className="border border-amber-500/30 p-3 text-sm text-amber-800 dark:text-amber-200">{t('resourceWorkbenchV2.schematicEditor.incompleteBlocks')}</div> : null}
    {!loading && !loadError && groups.length === 0 ? <p className="border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.schematicEditor.noBlocks')}</p> : null}
  </div>;
}
