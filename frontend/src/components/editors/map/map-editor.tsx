'use client';

import { useMemo, useState, type PointerEvent } from 'react';
import { Eraser, Grid2X2, Move, RotateCw, Settings2, Trash2 } from 'lucide-react';
import type { EditorAnalysis, EditorContentCatalog, EditorContentEntry } from '@/lib/editors/editor-api';
import { EDITOR_RULE_SCHEMA, ruleValue, validateObjectPosition, type MapDocument, type MapEditorObject, type MapTerrainCell, type RuleField } from '@/lib/editors/editor-model';
import { ContentIcon, contentLabel } from '../shared/content-icon';
import { ContentPicker } from '../shared/content-picker';
import { EditorViewport } from '../shared/editor-viewport';
import { WaveGroupEditor } from './wave-group-editor';

type Tool = 'select' | 'terrain' | 'overlay' | 'building' | 'core' | 'spawn' | 'erase';
type Props = { analysis: EditorAnalysis; catalog: EditorContentCatalog; document: MapDocument; onChange: (next: MapDocument) => void; mode: 'map' | 'wave' };
const CELL = 24;

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function terrainKey(x: number, y: number) { return `${x}:${y}`; }
function slug(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, '_'); }

export function MapEditor({ analysis, catalog, document, onChange, mode }: Props) {
  const metadata = analysis.renderer_metadata;
  const layers = record(metadata.tile_layers);
  const baseTerrain = useMemo(() => {
    const source = record(metadata.tile_layers).terrain;
    return Array.isArray(source) ? source.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row))) : [];
  }, [metadata.tile_layers]);
  const width = Number.isInteger(metadata.width) ? Number(metadata.width) : 1;
  const height = Number.isInteger(metadata.height) ? Number(metadata.height) : 1;
  const floors = useMemo(() => catalog.blocks.filter((item) => item.floor), [catalog.blocks]);
  const overlays = useMemo(() => catalog.blocks.filter((item) => item.overlay), [catalog.blocks]);
  const buildings = useMemo(() => catalog.blocks.filter((item) => item.placeable && !item.floor && !item.overlay && !item.spawn && !item.core), [catalog.blocks]);
  const cores = useMemo(() => catalog.blocks.filter((item) => item.core && item.placeable), [catalog.blocks]);
  const spawns = useMemo(() => catalog.blocks.filter((item) => item.spawn && item.placeable), [catalog.blocks]);
  const [tool, setTool] = useState<Tool>('select');
  const [tab, setTab] = useState<'tool' | 'objects' | 'rules' | 'waves' | 'map'>('tool');
  const [floorName, setFloorName] = useState(floors.find((item) => item.internal_name === 'stone')?.internal_name || floors[0]?.internal_name || 'stone');
  const [overlayName, setOverlayName] = useState(overlays[0]?.internal_name || 'air');
  const [blockName, setBlockName] = useState(buildings[0]?.internal_name || cores[0]?.internal_name || spawns[0]?.internal_name || '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showGrid, setShowGrid] = useState(true);
  const [advancedRules, setAdvancedRules] = useState(false);
  const [ruleSearch, setRuleSearch] = useState('');
  const selected = document.objects.find((item) => item.id === selectedId) || null;
  const editedTerrain = useMemo(() => {
    const base = new Map(baseTerrain.flatMap((row) => Number.isInteger(row.x) && Number.isInteger(row.y) && typeof row.name === 'string'
      ? [[terrainKey(Number(row.x), Number(row.y)), { x: Number(row.x), y: Number(row.y), floor: row.name, overlay: typeof row.overlay === 'string' ? row.overlay : 'air' } satisfies MapTerrainCell] as const] : []));
    return baseTerrain.flatMap((row) => {
      if (!Number.isInteger(row.x) || !Number.isInteger(row.y) || typeof row.name !== 'string') return [];
      const x = Number(row.x), y = Number(row.y), key = terrainKey(x, y);
      const baseCell = base.get(key);
      const cell = document.terrain_edits[key] || baseCell;
      return cell ? [{ ...cell, baseFloor: baseCell?.floor || 'stone', baseOverlay: baseCell?.overlay || 'air' }] : [];
    });
  }, [baseTerrain, document.terrain_edits]);
  const floorsByName = useMemo(() => new Map(catalog.blocks.filter((item) => item.floor).map((item) => [item.internal_name, item])), [catalog.blocks]);
  const overlaysByName = useMemo(() => new Map(catalog.blocks.filter((item) => item.overlay).map((item) => [item.internal_name, item])), [catalog.blocks]);
  const blocksByName = useMemo(() => new Map(catalog.blocks.map((item) => [item.internal_name, item])), [catalog.blocks]);
  const baseCells = useMemo(() => new Map(baseTerrain.flatMap((row) => Number.isInteger(row.x) && Number.isInteger(row.y) && typeof row.name === 'string'
    ? [[terrainKey(Number(row.x), Number(row.y)), { x: Number(row.x), y: Number(row.y), floor: row.name, overlay: typeof row.overlay === 'string' ? row.overlay : 'air' } satisfies MapTerrainCell] as const] : [])), [baseTerrain]);
  const liveObjects = document.objects;
  const objectsTruncated = layers.objects_truncated === true;
  const unknown = Array.isArray(metadata.unknown_content) ? metadata.unknown_content.filter((value): value is string => typeof value === 'string') : [];
  const incomplete = !document.terrain_complete || baseTerrain.length !== width * height || metadata.tile_layers_truncated === true;

  const cellAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.floor((event.clientX - rect.left) * width / rect.width);
    const y = Math.floor((event.clientY - rect.top) * height / rect.height);
    return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
  };
  const objectAt = (x: number, y: number) => [...liveObjects].reverse().find((item) => {
    return x >= item.x + item.size_offset && x < item.x + item.size_offset + item.size && y >= item.y + item.size_offset && y < item.y + item.size_offset + item.size;
  }) || null;
  const updateObject = (id: string, update: Partial<MapEditorObject>) => onChange({ ...document, objects: document.objects.map((item) => item.id === id ? { ...item, ...update } : item) });
  const paintTerrain = (x: number, y: number, nextFloor = floorName, nextOverlay = overlayName) => {
    const key = terrainKey(x, y), base = baseCells.get(key);
    if (!base) return;
    const value = { x, y, floor: nextFloor, overlay: nextOverlay };
    const terrain_edits = { ...document.terrain_edits };
    if (value.floor === base.floor && value.overlay === base.overlay) delete terrain_edits[key]; else terrain_edits[key] = value;
    onChange({ ...document, terrain_edits }); setError('');
  };
  const placeObject = (type: MapEditorObject['object_type'], x: number, y: number) => {
    if (objectsTruncated) { setError('对象目录被截断，当前地图不能安全新增建筑。'); return; }
    const block = catalog.blocks.find((item) => item.internal_name === blockName);
    if (!block || (type === 'core' && !block.core) || (type === 'spawn' && !block.spawn) || (type === 'building' && !block.placeable)) { setError('请先从方块库选择对应内容。'); return; }
    const candidate: MapEditorObject = { id: `added:${crypto.randomUUID()}`, object_type: type, original_x: null, original_y: null, x, y, name: block.internal_name, team: catalog.teams.find((entry) => entry.internal_name === 'sharded')?.internal_name || catalog.teams[0]?.internal_name || 'sharded', rotation: 0, size: block.size || 1, size_offset: block.size_offset ?? -Math.floor(((block.size || 1) - 1) / 2), added: true, editable: true, movable: true, deletable: true, team_editable: type !== 'spawn', rotatable: block.rotatable === true, reason: null };
    const reason = validateObjectPosition(candidate, width, height, liveObjects);
    if (reason) { setError(reason); return; }
    onChange({ ...document, objects: [...document.objects, candidate] }); setSelectedId(candidate.id); setError('');
  };
  const eraseAt = (x: number, y: number) => {
    const target = objectAt(x, y);
    if (target) {
      if (objectsTruncated) { setError('对象目录被截断，当前地图不能安全删除建筑。'); return; }
      if (!target.deletable) { setError(target.reason || '该对象当前不能安全删除。'); return; }
      onChange({ ...document, objects: document.objects.filter((item) => item.id !== target.id) }); setSelectedId(null); setError(''); return;
    }
    paintTerrain(x, y, 'stone', 'air');
  };
  const paintAt = (x: number, y: number) => {
    if (tool === 'terrain') paintTerrain(x, y, floorName, document.terrain_edits[terrainKey(x, y)]?.overlay || baseCells.get(terrainKey(x, y))?.overlay || 'air');
    else if (tool === 'overlay') paintTerrain(x, y, document.terrain_edits[terrainKey(x, y)]?.floor || baseCells.get(terrainKey(x, y))?.floor || 'stone', overlayName);
    else if (tool === 'building' || tool === 'core' || tool === 'spawn') placeObject(tool, x, y);
    else if (tool === 'erase') eraseAt(x, y);
  };
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const cell = cellAt(event); if (!cell) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    (event.currentTarget as SVGSVGElement & { __dragId?: string }).__dragId = undefined;
    if (tool === 'select') {
      const target = objectAt(cell.x, cell.y); setSelectedId(target?.id || null);
      if (target) setTab('objects');
      if (target && !target.movable) setError(target.reason || '该对象不能安全移动。'); else setError('');
      if (target?.movable && !objectsTruncated) (event.currentTarget as SVGSVGElement & { __dragId?: string }).__dragId = target.id;
      else if (target?.movable && objectsTruncated) setError('对象目录被截断，当前地图不能安全移动建筑。');
      return;
    }
    paintAt(cell.x, cell.y);
  };
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.buttons !== 1) return;
    const cell = cellAt(event); if (!cell) return;
    const svg = event.currentTarget as SVGSVGElement & { __dragId?: string };
    if (tool === 'select' && svg.__dragId) {
      const target = document.objects.find((item) => item.id === svg.__dragId);
      if (!target) return;
      const reason = validateObjectPosition({ ...target, x: cell.x, y: cell.y }, width, height, liveObjects.filter((item) => item.id !== target.id));
      if (reason) { setError(reason); return; }
      updateObject(target.id, { x: cell.x, y: cell.y }); setError('');
    } else if (tool !== 'select') paintAt(cell.x, cell.y);
  };
  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => { (event.currentTarget as SVGSVGElement & { __dragId?: string }).__dragId = undefined; };
  const removeSelected = () => {
    if (!selected) return;
    if (objectsTruncated) { setError('对象目录被截断，当前地图不能安全删除建筑。'); return; }
    if (!selected.deletable) { setError(selected.reason || '该对象不能安全删除。'); return; }
    onChange({ ...document, objects: document.objects.filter((item) => item.id !== selected.id) }); setSelectedId(null); setError('');
  };
  const rotateSelected = () => { if (objectsTruncated) { setError('对象目录被截断，当前地图不能安全旋转建筑。'); return; } if (selected?.rotatable) updateObject(selected.id, { rotation: (selected.rotation + 1) & 3 }); else if (selected) setError('这个建筑不可旋转，或 Renderer 尚未开放安全旋转。'); };
  const changeRule = (field: RuleField, value: unknown) => onChange({ ...document, rule_changes: { ...document.rule_changes, [field.key]: value } });
  const changeBanned = (field: RuleField, id: string, checked: boolean) => {
    const current = ruleValue({ ...record(metadata.rules), ...document.rule_changes }, field.key, record(catalog.rule_defaults));
    const names = Array.isArray(current) ? current.filter((value): value is string => typeof value === 'string') : [];
    changeRule(field, checked ? [...new Set([...names, id])] : names.filter((name) => name !== id));
  };
  const tools: Array<{ id: Tool; label: string; icon: typeof Move }> = [
    { id: 'select', label: '选择', icon: Move }, { id: 'terrain', label: '地形', icon: Grid2X2 }, { id: 'overlay', label: '覆盖物', icon: Grid2X2 },
    { id: 'building', label: '建筑', icon: Settings2 }, { id: 'core', label: '核心', icon: Settings2 }, { id: 'spawn', label: '出生点', icon: Settings2 }, { id: 'erase', label: '橡皮擦', icon: Eraser },
  ];
  const mapRuleValues = { ...record(catalog.rule_defaults), ...record(metadata.rules) };
  const ruleFields = EDITOR_RULE_SCHEMA.filter((field) => field.advanced === advancedRules && `${field.label} ${field.description}`.toLocaleLowerCase().includes(ruleSearch.toLocaleLowerCase()));
  const renderRule = (field: RuleField) => {
    const value = ruleValue({ ...mapRuleValues, ...document.rule_changes }, field.key, record(catalog.rule_defaults));
    if (field.type === 'boolean') return <label key={field.key} className="flex min-h-12 items-center gap-3 border-b border-[var(--border)] py-2 text-sm"><input type="checkbox" checked={value === true} onChange={(event) => changeRule(field, event.target.checked)} className="h-5 w-5" /><span className="min-w-0 flex-1"><span className="block font-medium">{field.label}</span><span className="text-xs text-[var(--text-muted)]">{field.description}</span></span></label>;
    if (field.type === 'blocks' || field.type === 'units') {
      const entries = field.type === 'blocks' ? catalog.blocks.filter((item) => item.placeable) : catalog.units;
      const names = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
      return <details key={field.key} className="border-b border-[var(--border)] py-2"><summary className="cursor-pointer text-sm font-medium">{field.label} · {names.length}<span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{field.description}</span></summary><div className="mt-2 h-64"><ContentPicker entries={entries} value="" onChange={(entry) => changeBanned(field, entry.internal_name, !names.includes(entry.internal_name))} label={field.label} /><div className="flex flex-wrap gap-1 py-2">{names.map((name) => { const entry = entries.find((item) => item.internal_name === name); return <button key={name} type="button" onClick={() => changeBanned(field, name, false)} className="inline-flex min-h-9 items-center gap-1 border border-[var(--border)] px-2 text-xs"><ContentIcon entry={entry} size={20} />{entry?.display_name || name} ×</button>; })}</div></div></details>;
    }
    return <label key={field.key} className="block space-y-1 border-b border-[var(--border)] py-2 text-sm"><span className="font-medium">{field.label}{field.unit ? <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">({field.unit})</span> : null}</span><span className="block text-xs text-[var(--text-muted)]">{field.description}</span><input type={field.type === 'text' ? 'text' : 'number'} maxLength={field.type === 'text' ? 100 : undefined} min={field.min} max={field.max} step={field.type === 'integer' ? 1 : 'any'} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={(event) => {
      if (field.type === 'text') { changeRule(field, event.target.value); return; }
      const number = Number(event.target.value);
      if (!Number.isFinite(number) || number < (field.min ?? -Infinity) || number > (field.max ?? Infinity) || (field.type === 'integer' && !Number.isInteger(number))) { setError(`${field.label}数值无效。`); return; }
      changeRule(field, number); setError('');
    }} className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3" /></label>;
  };
  const chosenBlock = catalog.blocks.find((item) => item.internal_name === blockName);
  const selectedEntry = selected ? blocksByName.get(selected.name) : null;
  const teamEntries = catalog.teams;

  return <div className="grid min-h-[min(80vh,900px)] min-w-0 grid-cols-1 border-y border-[var(--border)] lg:grid-cols-[230px_minmax(0,1fr)_300px]">
    <aside className="hidden min-h-0 flex-col border-r border-[var(--border)] lg:flex"><div className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold">地图工具</div><div className="grid grid-cols-2 gap-1 p-2">{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setTool(id); setTab('tool'); }} aria-pressed={tool === id} className={`flex min-h-10 items-center gap-1 px-2 text-xs ${tool === id ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'hover:bg-[var(--bg-hover)]'}`}><Icon className="h-4 w-4" />{label}</button>)}</div><div className="min-h-0 flex-1 border-t border-[var(--border)] p-2"><ToolPalette tool={tool} floors={floors} overlays={overlays} entries={tool === 'core' ? cores : tool === 'spawn' ? spawns : buildings} floorName={floorName} overlayName={overlayName} blockName={blockName} onFloor={setFloorName} onOverlay={setOverlayName} onBlock={setBlockName} /></div></aside>
    <section className="flex min-h-[360px] min-w-0 flex-col">
      <div className="flex min-h-11 items-center gap-1 overflow-x-auto border-b border-[var(--border)] px-2"><div className="flex gap-1 lg:hidden">{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setTool(id); setTab('tool'); }} aria-pressed={tool === id} className={`flex min-h-10 shrink-0 items-center gap-1 px-2 text-xs ${tool === id ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : ''}`}><Icon className="h-4 w-4" />{label}</button>)}</div><button type="button" onClick={() => setShowGrid((value) => !value)} aria-pressed={showGrid} className="ml-auto flex min-h-10 shrink-0 items-center gap-1 px-2 text-xs"><Grid2X2 className="h-4 w-4" />网格</button><span className="shrink-0 text-xs text-[var(--text-muted)]">{width}×{height}</span></div>
      {incomplete || objectsTruncated || unknown.length ? <div role="status" className="space-y-1 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"><strong>支持情况</strong><div>{incomplete ? '地形图层不完整；为避免误写，地形编辑已禁用。' : '地形和规则可编辑。'}{objectsTruncated ? ' 对象列表被截断，对象编辑已禁用。' : ` 对象：${liveObjects.filter((item) => item.movable).length}/${liveObjects.length} 个可移动。`}</div>{unknown.length ? <div>发现未知或 Mod 内容：{unknown.slice(0, 8).join('、')}。Renderer 会在导出时继续安全校验。</div> : null}{liveObjects.filter((item) => !item.movable).slice(0, 3).map((item) => <div key={item.id}>· {item.name}（{item.x},{item.y}）：{item.reason || '当前不能安全移动'}</div>)}</div> : null}
      <EditorViewport className="min-h-[360px] flex-1" contentWidth={width * CELL} contentHeight={height * CELL}>
        <svg role="grid" aria-label="地图画布" tabIndex={0} width={width * CELL} height={height * CELL} viewBox={`0 0 ${width} ${height}`} className="block bg-[#18212a] outline-none [touch-action:none]" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onKeyDown={(event) => { if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { event.preventDefault(); removeSelected(); } else if (event.key.toLowerCase() === 'r' && selected) { event.preventDefault(); rotateSelected(); } }}>
          <defs>{[...floors, ...overlays].filter((entry) => entry.icon).map((entry) => <pattern key={entry.internal_name} id={`map-${slug(entry.internal_name)}`} width="1" height="1" patternUnits="userSpaceOnUse"><image href={entry.icon || ''} width="1" height="1" preserveAspectRatio="xMidYMid slice" /></pattern>)}{showGrid ? <pattern id="map-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0 L0 0 0 1" fill="none" stroke="#60717d" strokeWidth="0.035" /></pattern> : null}</defs>
          {editedTerrain.map((cell) => { const floor = floorsByName.get(cell.floor); const overlay = overlaysByName.get(cell.overlay); return <g key={terrainKey(cell.x, cell.y)}><rect x={cell.x} y={cell.y} width="1" height="1" fill={floor?.icon ? `url(#map-${slug(cell.floor)})` : floor?.color || floorColor(cell.floor)} onPointerEnter={(event) => { if (event.buttons === 1 && tool !== 'select') paintAt(cell.x, cell.y); }} />{overlay && cell.overlay !== 'air' && overlay.icon ? <image href={overlay.icon} x={cell.x + 0.08} y={cell.y + 0.08} width="0.84" height="0.84" preserveAspectRatio="xMidYMid meet" style={{ imageRendering: 'pixelated', pointerEvents: 'none' }} /> : null}</g>; })}
          {showGrid ? <rect width={width} height={height} fill="url(#map-grid)" pointerEvents="none" /> : null}
          {liveObjects.map((item) => { const entry = blocksByName.get(item.name); const left = item.x + item.size_offset; const top = item.y + item.size_offset; return <g key={item.id} aria-label={`${entry?.display_name || item.name}，${item.x},${item.y}`}><rect x={left + 0.05} y={top + 0.05} width={item.size - 0.1} height={item.size - 0.1} fill={teamEntries.find((team) => team.internal_name === item.team)?.color || '#7190a6'} opacity="0.62" stroke={item.id === selectedId ? '#ffe066' : item.editable ? '#e3edf2' : '#e89a6b'} strokeWidth={item.id === selectedId ? 0.14 : 0.06} />{entry?.icon ? <image href={entry.icon} x={left + 0.13} y={top + 0.13} width={item.size - 0.26} height={item.size - 0.26} preserveAspectRatio="xMidYMid meet" style={{ imageRendering: 'pixelated', pointerEvents: 'none', transformBox: 'fill-box', transformOrigin: 'center', transform: `rotate(${item.rotation * 90}deg)` }} /> : null}<text x={item.x + 0.5} y={item.y + 0.68} textAnchor="middle" fontSize="0.52" fill="white" stroke="#111" strokeWidth="0.04" paintOrder="stroke" pointerEvents="none">{item.object_type === 'core' ? '核' : item.object_type === 'spawn' ? '生' : ''}</text></g>; })}
        </svg>
      </EditorViewport>
      <div className="flex min-h-11 items-center gap-2 border-t border-[var(--border)] px-3 text-xs text-[var(--text-muted)]"><span className="truncate">{selected ? `${selectedEntry?.display_name || selected.name} · ${selected.x}, ${selected.y}` : toolHint(tool)}</span>{selected && !selected.movable ? <span className="shrink-0 text-amber-700">只读对象</span> : null}</div>
    </section>
    <nav className="flex min-h-11 overflow-x-auto border-t border-[var(--border)] lg:hidden">{(['tool', 'objects', 'rules', 'waves', 'map'] as const).filter((value) => mode === 'map' || value === 'waves' || value === 'map').map((value) => <button type="button" key={value} onClick={() => setTab(value)} className={`min-h-11 flex-1 whitespace-nowrap px-3 text-xs ${tab === value ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : ''}`}>{({ tool: '工具库', objects: '对象', rules: '规则', waves: '波次', map: '属性' })[value]}</button>)}</nav>
    <aside className="min-h-0 overflow-y-auto border-t border-[var(--border)] lg:border-l lg:border-t-0">{mode === 'map' ? <div className="hidden min-h-11 border-b border-[var(--border)] lg:flex">{(['tool', 'objects', 'rules', 'waves', 'map'] as const).map((value) => <button type="button" key={value} onClick={() => setTab(value)} className={`flex-1 px-2 text-xs ${tab === value ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : ''}`}>{({ tool: '工具', objects: '对象', rules: '规则', waves: '波次', map: '地图属性' })[value]}</button>)}</div> : <div className="flex min-h-11 border-b border-[var(--border)]"><button type="button" onClick={() => setTab('waves')} className="flex-1 px-3 text-sm font-semibold">波次编辑器</button></div>}
      <div className="max-h-[60vh] overflow-y-auto p-3 lg:max-h-[calc(80vh-44px)]">
        {mode === 'wave' || tab === 'waves' ? <WaveGroupEditor groups={document.waves} catalog={catalog} onChange={(waves) => onChange({ ...document, waves })} /> : null}
        {mode === 'map' && tab === 'tool' ? <div className="lg:hidden"><ToolPalette tool={tool} floors={floors} overlays={overlays} entries={tool === 'core' ? cores : tool === 'spawn' ? spawns : buildings} floorName={floorName} overlayName={overlayName} blockName={blockName} onFloor={setFloorName} onOverlay={setOverlayName} onBlock={setBlockName} /></div> : null}
        {mode === 'map' && tab === 'objects' ? selected ? <div className="space-y-3"><div className="flex items-center gap-2"><ContentIcon entry={selectedEntry} size={34} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{selectedEntry?.display_name || selected.name}</p><p className="text-xs text-[var(--text-muted)]">{selected.x}, {selected.y} · {selected.size}×{selected.size}</p></div></div>{objectsTruncated ? <p className="text-xs text-amber-700 dark:text-amber-200">对象列表不完整；为避免覆盖未知建筑，这些对象暂时不能修改。</p> : null}{selected.reason && !selected.movable ? <p className="text-xs text-amber-700 dark:text-amber-200">{selected.reason}</p> : null}<label className="block space-y-1 text-sm"><span>队伍</span><select disabled={!selected.team_editable || objectsTruncated} value={selected.team} onChange={(event) => updateObject(selected.id, { team: event.target.value })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3">{teamEntries.map((entry) => <option key={entry.internal_name} value={entry.internal_name}>{contentLabel(entry)}</option>)}</select></label><div className="flex gap-2"><button type="button" disabled={!selected.rotatable || objectsTruncated} onClick={rotateSelected} className="min-h-10 flex-1 border border-[var(--border)] text-sm disabled:opacity-40"><RotateCw className="mr-1 inline h-4 w-4" />旋转</button><button type="button" disabled={!selected.deletable || objectsTruncated} onClick={removeSelected} className="min-h-10 flex-1 border border-red-500/40 text-sm text-red-700 disabled:opacity-40"><Trash2 className="mr-1 inline h-4 w-4" />删除</button></div></div> : <p className="text-sm text-[var(--text-muted)]">点击画布上的对象查看属性。无法安全编辑的对象会保持只读，并显示原因。</p> : null}
        {mode === 'map' && tab === 'rules' ? <div className="space-y-2"><label className="block space-y-1 text-xs"><span>搜索规则</span><input value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm" placeholder="中文规则名称" /></label><button type="button" onClick={() => setAdvancedRules((value) => !value)} className="min-h-10 text-sm text-[var(--primary)]">{advancedRules ? '显示基础规则' : '显示高级规则'}</button><div>{ruleFields.map(renderRule)}</div></div> : null}
        {mode === 'map' && tab === 'map' ? <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-[var(--text-muted)]">地图大小</dt><dd>{width} × {height}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">地形格数</dt><dd>{baseTerrain.length.toLocaleString()}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">建筑对象</dt><dd>{liveObjects.length}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">敌人波次组</dt><dd>{document.waves.length}</dd></div><p className="col-span-2 text-xs text-[var(--text-muted)]">地图尺寸与存档格式由 Renderer 管理；编辑器导出时使用官方 MapIO。</p></dl> : null}
      </div>
    </aside>
    {error ? <p role="alert" className="fixed bottom-16 left-3 right-3 z-40 border border-red-500/40 bg-[var(--bg-card)] p-3 text-sm text-red-700 shadow-lg dark:text-red-300 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-md">{error}</p> : null}
  </div>;
}

function ToolPalette({ tool, floors, overlays, entries, floorName, overlayName, blockName, onFloor, onOverlay, onBlock }: { tool: Tool; floors: EditorContentEntry[]; overlays: EditorContentEntry[]; entries: EditorContentEntry[]; floorName: string; overlayName: string; blockName: string; onFloor: (name: string) => void; onOverlay: (name: string) => void; onBlock: (name: string) => void }) {
  if (tool === 'terrain') return <ContentPicker entries={floors} value={floorName} onChange={(entry) => onFloor(entry.internal_name)} label="地形目录" />;
  if (tool === 'overlay') return <ContentPicker entries={overlays} value={overlayName} onChange={(entry) => onOverlay(entry.internal_name)} label="覆盖物目录" />;
  if (['building', 'core', 'spawn'].includes(tool)) return <ContentPicker entries={entries} value={blockName} onChange={(entry) => onBlock(entry.internal_name)} label={tool === 'core' ? '核心目录' : tool === 'spawn' ? '出生点目录' : '建筑目录'} />;
  return <p className="p-2 text-sm text-[var(--text-muted)]">{tool === 'erase' ? '点击地形或可删除对象进行擦除。' : '点选画布对象，拖动可移动可编辑对象。'}</p>;
}

function floorColor(name: string) {
  if (/water|liquid|slag|oil|tar/i.test(name)) return '#234d60';
  if (/sand|dune|regolith/i.test(name)) return '#82724d';
  if (/snow|ice|frost/i.test(name)) return '#94aeb4';
  if (/stone|rock|shale|basalt/i.test(name)) return '#5e676c';
  return '#3f594a';
}

function toolHint(tool: Tool) { return ({ select: '点击对象选择，拖动移动；触屏用双指缩放和平移。', terrain: '选择地形后在画布拖动绘制。', overlay: '选择覆盖物后在画布拖动绘制。', building: '选择建筑后点击地图放置。', core: '选择核心后点击地图放置。', spawn: '选择出生点后点击地图放置。', erase: '点击地形或对象擦除。' })[tool]; }
