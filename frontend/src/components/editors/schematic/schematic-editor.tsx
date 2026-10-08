'use client';

import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Copy, FlipHorizontal, Move, RotateCw, Trash2 } from 'lucide-react';
import type { EditorAnalysis, EditorContentCatalog, EditorContentEntry } from '@/lib/editors/editor-api';
import { type SchematicDocument, type SchematicPlacement } from '@/lib/editors/editor-model';
import { ContentPicker } from '../shared/content-picker';
import { ContentIcon, contentLabel } from '../shared/content-icon';
import { EditorViewport } from '../shared/editor-viewport';

type Props = { analysis: EditorAnalysis; catalog: EditorContentCatalog; document: SchematicDocument; onChange: (next: SchematicDocument) => void; fullLogic: boolean };
type CellPoint = { x: number; y: number };
const CELL = 28;

function footprint(item: Pick<SchematicPlacement, 'x' | 'y' | 'size' | 'size_offset'>) {
  return { left: item.x + item.size_offset, bottom: item.y + item.size_offset, right: item.x + item.size_offset + item.size, top: item.y + item.size_offset + item.size };
}

function collides(item: SchematicPlacement, placements: SchematicPlacement[], width: number, height: number, ignore: Set<string>) {
  const box = footprint(item);
  if (box.left < 0 || box.bottom < 0 || box.right > width || box.top > height) return '这个方块的占地超出了蓝图边界。';
  for (const other of placements) {
    if (ignore.has(other.id) || other.deleted) continue;
    const current = footprint(other);
    if (box.left < current.right && box.right > current.left && box.bottom < current.top && box.top > current.bottom) return '这个位置与其他方块重叠。';
  }
  return null;
}

function displayPoint(point: CellPoint, width: number, height: number, mirror: boolean): CellPoint {
  return { x: mirror ? width - 1 - point.x : point.x, y: point.y };
}

function sourcePoint(point: CellPoint, width: number, height: number, mirror: boolean): CellPoint {
  return displayPoint(point, width, height, mirror);
}

function getCell(event: PointerEvent<SVGSVGElement>, width: number, height: number, mirror: boolean): CellPoint | null {
  const rect = event.currentTarget.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const displayed = { x: Math.floor((event.clientX - rect.left) * width / rect.width), y: Math.floor((event.clientY - rect.top) * height / rect.height) };
  if (displayed.x < 0 || displayed.y < 0 || displayed.x >= width || displayed.y >= height) return null;
  return sourcePoint(displayed, width, height, mirror);
}

function visiblePoint(item: SchematicPlacement, width: number, height: number, mirror: boolean): CellPoint {
  return displayPoint(item, width, height, mirror);
}

function ConfigPanel({ placement, catalog, document, onChange, fullLogic }: {
  placement: SchematicPlacement; catalog: EditorContentCatalog; document: SchematicDocument; onChange: (next: SchematicDocument) => void; fullLogic: boolean;
}) {
  const entry = catalog.blocks.find((item) => item.internal_name === placement.block);
  const descriptors = placement.config_types?.length ? placement.config_types : entry?.config_types || [];
  const current = placement.config || null;
  const update = (config: Record<string, unknown>) => onChange({ ...document, placements: document.placements.map((item) => item.id === placement.id ? { ...item, config } : item) });
  const contentEntries = (type: unknown): EditorContentEntry[] => type === 'item' ? catalog.items : type === 'liquid' ? catalog.liquids : type === 'unit' ? catalog.units : type === 'status' ? catalog.statuses : catalog.blocks;
  if (placement.logic_source_available && placement.logic_source !== undefined) return fullLogic
    ? <label className="block space-y-2 text-sm"><span className="font-medium">逻辑处理器代码</span><textarea value={placement.logic_source} onChange={(event) => onChange({ ...document, placements: document.placements.map((item) => item.id === placement.id ? { ...item, logic_source: event.target.value } : item) })} maxLength={100_000} rows={12} className="min-h-56 w-full border border-[var(--border)] bg-[var(--bg-page)] p-3 font-mono text-xs" /><span className="block text-xs text-[var(--text-muted)]">保存时会由 Renderer 验证逻辑配置格式；未知或不可读取的逻辑配置保持只读。</span></label>
    : <p className="text-sm text-[var(--text-muted)]">Renderer 目前只开放安全读取；逻辑源码保持只读。</p>;
  if (!placement.config_editable) return <p className="text-sm text-[var(--text-muted)]">这个方块的配置无法安全读取，内容会保留原样。</p>;
  if (!descriptors.length) return <p className="text-sm text-[var(--text-muted)]">这个方块没有可编辑配置。</p>;
  const type = typeof current?.type === 'string' ? current.type : '';
  const descriptor = descriptors.find((value) => value.type === type) || (descriptors.length === 1 ? descriptors[0] : null);
  const contentType = typeof current?.content_type === 'string' ? current.content_type : descriptor?.content_type || '';
  return <div className="space-y-3">
    <label className="block space-y-1 text-sm"><span>配置项目</span><select value={type || ''} onChange={(event) => {
      const nextType = event.target.value;
      const nextDescriptor = descriptors.find((item) => item.type === nextType);
      if (!nextDescriptor) return;
      const value = nextDescriptor.type === 'content' ? { type: 'content', content_type: nextDescriptor.content_type || 'item', name: '' }
        : nextDescriptor.type === 'tech_node' ? { type: 'tech_node', content_type: 'item', name: '' }
          : nextDescriptor.type === 'boolean' ? { type: 'boolean', value: false }
            : nextDescriptor.type === 'text' ? { type: 'text', value: '' }
              : nextDescriptor.type === 'color' ? { type: 'color', value: '#ffffffff' }
                : nextDescriptor.type === 'integer' || nextDescriptor.type === 'long' || nextDescriptor.type === 'float' || nextDescriptor.type === 'double' ? { type: nextDescriptor.type, value: 0 }
                  : nextDescriptor.type === 'none' ? { type: 'none' } : { type: nextDescriptor.type };
      update(value);
    }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3">
      <option value="">选择配置</option>{descriptors.map((item, index) => <option key={`${item.type}:${item.content_type}:${index}`} value={item.type}>{configTypeLabel(item.type)}{item.content_type ? ` · ${contentTypeLabel(item.content_type)}` : ''}</option>)}
    </select></label>
    {current && ['content', 'tech_node'].includes(type) ? <>
      {type === 'tech_node' ? <label className="block space-y-1 text-sm"><span>内容类别</span><select value={contentType} onChange={(event) => update({ ...current, content_type: event.target.value, name: '' })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3">{['item', 'block', 'unit', 'liquid', 'status', 'planet'].map((item) => <option key={item} value={item}>{contentTypeLabel(item)}</option>)}</select></label> : null}
      <ContentPicker entries={contentEntries(contentType)} value={typeof current.name === 'string' ? current.name : ''} onChange={(item) => update({ ...current, name: item.internal_name })} label="配置内容" className="h-56" />
    </> : null}
    {current?.type === 'boolean' ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={current.value === true} onChange={(event) => update({ ...current, value: event.target.checked })} className="h-5 w-5" />启用</label> : null}
    {current?.type === 'text' ? <label className="block space-y-1 text-sm"><span>文本</span><textarea value={typeof current.value === 'string' ? current.value : ''} maxLength={1200} onChange={(event) => update({ ...current, value: event.target.value })} rows={5} className="w-full border border-[var(--border)] bg-[var(--bg-card)] p-3" /></label> : null}
    {current?.type === 'color' ? <label className="flex min-h-11 items-center gap-3 text-sm"><span>颜色</span><input type="color" value={typeof current.value === 'string' ? current.value.slice(0, 7) : '#ffffff'} onChange={(event) => update({ ...current, value: `${event.target.value}ff` })} className="h-11 w-16 border border-[var(--border)] bg-transparent p-1" /><span className="font-mono text-xs text-[var(--text-muted)]">透明度默认 100%</span></label> : null}
    {current && ['integer', 'long', 'float', 'double'].includes(type) ? <label className="block space-y-1 text-sm"><span>数值</span><input type="number" step={['integer', 'long'].includes(type) ? 1 : 'any'} value={typeof current.value === 'number' || typeof current.value === 'string' ? current.value : 0} onChange={(event) => update({ ...current, value: type === 'long' ? event.target.value : Number(event.target.value) || 0 })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3" /></label> : null}
    {current && !['content', 'tech_node', 'boolean', 'text', 'color', 'integer', 'long', 'float', 'double', 'none'].includes(type) ? <details className="border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">高级原始配置</summary><textarea value={JSON.stringify(current, null, 2)} onChange={(event) => { try { const parsed = JSON.parse(event.target.value) as unknown; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) update(parsed as Record<string, unknown>); } catch { /* keep the last valid value */ } }} rows={8} className="mt-2 w-full border border-[var(--border)] bg-[var(--bg-page)] p-3 font-mono text-xs" /></details> : null}
  </div>;
}

function configTypeLabel(type: string): string {
  return ({ none: '无额外配置', boolean: '开关', text: '文本', content: '物品 / 方块 / 液体', tech_node: '科技树节点', integer: '整数', long: '整数', float: '小数', double: '小数', color: '颜色', point: '连接目标', point_array: '连接目标列表', vec2: '位置向量', vec2_array: '位置向量列表', int_seq: '数字列表', int_array: '数字列表', boolean_array: '开关列表', team: '队伍', l_access: '逻辑访问属性', unit_command: '单位指令', logic: '逻辑处理器代码' } as Record<string, string>)[type] || '高级配置';
}

function contentTypeLabel(type: string): string {
  return ({ item: '物品', block: '方块', unit: '单位', liquid: '液体', status: '状态效果', planet: '星球' } as Record<string, string>)[type] || '游戏内容';
}

export function SchematicEditor({ analysis, catalog, document, onChange, fullLogic }: Props) {
  const metadata = analysis.renderer_metadata;
  const width = Number(metadata.width) || 1; const height = Number(metadata.height) || 1;
  const placeable = useMemo(() => catalog.blocks.filter((entry) => entry.placeable && !entry.floor && !entry.overlay), [catalog.blocks]);
  const [selectedBlock, setSelectedBlock] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<'select' | 'place'>('select');
  const [multiSelect, setMultiSelect] = useState(false);
  const [message, setMessage] = useState('');
  const [mobilePropertiesOpen, setMobilePropertiesOpen] = useState(false);
  const [interactionRevision, setInteractionRevision] = useState(0);
  const drag = useRef<{ start: CellPoint; pointer: CellPoint; ids: string[]; origins: Map<string, CellPoint> } | null>(null);
  const boxSelect = useRef<{ start: CellPoint; current: CellPoint; additive: boolean } | null>(null);
  const longPress = useRef<{ pointerId: number; start: CellPoint; timer: ReturnType<typeof setTimeout> } | null>(null);
  const clipboard = useRef<Array<Omit<SchematicPlacement, 'id' | 'source_x' | 'source_y' | 'deleted'>>>([]);
  const selectedPlacements = document.placements.filter((item) => selection.has(item.id) && !item.deleted);
  const selected = selectedPlacements[0] || null;
  const entryFor = (name: string) => catalog.blocks.find((entry) => entry.internal_name === name);
  const visiblePlacements = document.placements.filter((item) => !item.deleted);
  const displayed = visiblePlacements.map((item) => {
    const offset = drag.current?.ids.includes(item.id) ? { x: drag.current.pointer.x - drag.current.start.x, y: drag.current.pointer.y - drag.current.start.y } : { x: 0, y: 0 };
    const position = { x: item.x + offset.x, y: item.y + offset.y };
    const x = document.mirror_x ? width - 1 - position.x : position.x;
    const rotation = document.mirror_x ? (4 - item.rotation) & 3 : item.rotation;
    return { ...item, displayX: x, displayY: position.y, displayRotation: rotation };
  });
  const getSourceCell = (event: PointerEvent<SVGSVGElement>) => getCell(event, width, height, document.mirror_x);
  const occupant = (point: CellPoint) => visiblePlacements.find((item) => {
    const box = footprint({ ...item, ...(drag.current?.ids.includes(item.id) ? { x: drag.current.pointer.x, y: drag.current.pointer.y } : {}) });
    return point.x >= box.left && point.x < box.right && point.y >= box.bottom && point.y < box.top;
  });
  const placeAt = (point: CellPoint) => {
    const entry = placeable.find((item) => item.internal_name === selectedBlock);
    if (!entry) { setMessage('先从方块库选择要放置的方块。'); return; }
    const next: SchematicPlacement = { id: `added:${crypto.randomUUID()}`, source_x: null, source_y: null, x: point.x, y: point.y, block: entry.internal_name, rotation: 0, original_rotation: 0, size: entry.size || 1, size_offset: entry.size_offset ?? -Math.floor(((entry.size || 1) - 1) / 2), config_types: entry.config_types || [], config_editable: false, deleted: false };
    const reason = collides(next, visiblePlacements, width, height, new Set());
    if (reason) { setMessage(reason); return; }
    onChange({ ...document, placements: [...document.placements, next] }); setMessage(''); setSelection(new Set([next.id])); setMobilePropertiesOpen(true);
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const point = getSourceCell(event); if (!point) return;
    if (event.button === 2) {
      const target = occupant(point);
      if (target) { setSelection(new Set([target.id])); setMobilePropertiesOpen(true); }
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      if (longPress.current) clearTimeout(longPress.current.timer);
      const timer = setTimeout(() => {
        const target = occupant(point);
        if (target) { setSelection(new Set([target.id])); setMobilePropertiesOpen(true); }
      }, 550);
      longPress.current = { pointerId: event.pointerId, start: point, timer };
    }
    if (tool === 'place') { placeAt(point); return; }
    const target = occupant(point);
    const additive = multiSelect || event.shiftKey || event.ctrlKey || event.metaKey;
    if (!target) {
      boxSelect.current = { start: point, current: point, additive };
      setSelection((current) => additive ? current : new Set());
      if (!additive) setMobilePropertiesOpen(false);
      setInteractionRevision((revision) => revision + 1);
      return;
    }
    const nextSelection = additive ? new Set(selection) : new Set([target.id]);
    if (additive && nextSelection.has(target.id)) nextSelection.delete(target.id); else nextSelection.add(target.id);
    setSelection(nextSelection);
    setMobilePropertiesOpen(true);
    if (!nextSelection.has(target.id)) return;
    const origins = new Map<string, CellPoint>();
    for (const item of visiblePlacements) if (nextSelection.has(item.id)) origins.set(item.id, { x: item.x, y: item.y });
    drag.current = { start: point, pointer: point, ids: [...nextSelection], origins };
    setInteractionRevision((revision) => revision + 1);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = getSourceCell(event); if (!point) return;
    if (longPress.current?.pointerId === event.pointerId && (point.x !== longPress.current.start.x || point.y !== longPress.current.start.y)) {
      clearTimeout(longPress.current.timer); longPress.current = null;
    }
    if (drag.current) drag.current = { ...drag.current, pointer: point };
    if (boxSelect.current) boxSelect.current = { ...boxSelect.current, current: point };
    if (drag.current || boxSelect.current) setInteractionRevision((revision) => revision + 1);
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (longPress.current?.pointerId === event.pointerId) { clearTimeout(longPress.current.timer); longPress.current = null; }
    if (drag.current) {
      const currentDrag = drag.current; drag.current = null;
      const dx = currentDrag.pointer.x - currentDrag.start.x; const dy = currentDrag.pointer.y - currentDrag.start.y;
      if (dx || dy) {
        const ids = new Set(currentDrag.ids);
        const next = document.placements.map((item) => currentDrag.origins.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item);
        const moving = next.filter((item) => ids.has(item.id));
        const fixed = next.filter((item) => !ids.has(item.id) && !item.deleted);
        const invalid = moving.find((item) => collides(item, fixed.concat(moving.filter((other) => other.id !== item.id)), width, height, new Set([item.id])));
        if (invalid) setMessage('移动后会超出蓝图或与其他方块重叠。'); else { onChange({ ...document, placements: next }); setMessage(''); }
      }
    }
    if (boxSelect.current) {
      const box = boxSelect.current; boxSelect.current = null;
      const left = Math.min(box.start.x, box.current.x); const right = Math.max(box.start.x, box.current.x);
      const bottom = Math.min(box.start.y, box.current.y); const top = Math.max(box.start.y, box.current.y);
      const hits = visiblePlacements.filter((item) => { const bounds = footprint(item); return bounds.left <= right && bounds.right - 1 >= left && bounds.bottom <= top && bounds.top - 1 >= bottom; });
      setSelection((current) => box.additive ? new Set([...current, ...hits.map((item) => item.id)]) : new Set(hits.map((item) => item.id)));
    }
    setInteractionRevision((revision) => revision + 1);
  };
  const mutateSelection = (mutate: (placement: SchematicPlacement) => SchematicPlacement) => onChange({ ...document, placements: document.placements.map((item) => selection.has(item.id) ? mutate(item) : item) });
  const rotateSelected = () => {
    if (selectedPlacements.some((item) => item.config_types?.some((descriptor) => ['point', 'point_array', 'vec2', 'vec2_array'].includes(descriptor.type)))) {
      setMessage('所选方块包含坐标连接配置，暂不能安全旋转。'); return;
    }
    mutateSelection((item) => ({ ...item, rotation: (item.rotation + 1) & 3 })); setMessage('');
  };
  const removeSelected = () => { mutateSelection((item) => ({ ...item, deleted: true })); setSelection(new Set()); setMobilePropertiesOpen(false); };
  const copySelected = () => { clipboard.current = selectedPlacements.map(({ id, source_x, source_y, deleted, original_config, original_logic_source, ...item }) => item); setMessage(`已复制 ${clipboard.current.length} 个方块。`); };
  const pasteSelected = () => {
    if (!clipboard.current.length) { setMessage('先选择方块并复制。'); return; }
    const added = clipboard.current.map((item, index) => ({ ...item, id: `added:paste:${crypto.randomUUID?.() || Date.now()}:${index}`, source_x: null, source_y: null, x: Math.min(width - 1, item.x + 1), y: Math.min(height - 1, item.y + 1), original_rotation: item.rotation, deleted: false }));
    const invalid = added.find((item) => collides(item, visiblePlacements.concat(added.filter((other) => other.id !== item.id)), width, height, new Set()));
    if (invalid) { setMessage('粘贴位置与现有方块冲突。'); return; }
    onChange({ ...document, placements: [...document.placements, ...added] }); setSelection(new Set(added.map((item) => item.id)));
  };
  const gridWidth = document.mirror_x ? width : width; const gridHeight = height;
  const unsupported = Array.isArray(metadata.unknown_content) ? metadata.unknown_content.filter((item): item is string => typeof item === 'string') : [];
  const truncated = metadata.block_positions_truncated === true;
  const unsupportedConfigs = visiblePlacements.filter((item) => item.config !== null && !item.config_editable).length;
  const preview = visiblePlacements.map((item) => drag.current?.ids.includes(item.id)
    ? { ...item, x: item.x + drag.current.pointer.x - drag.current.start.x, y: item.y + drag.current.pointer.y - drag.current.start.y } : item);
  const movingIds = new Set(drag.current?.ids || []);
  const moving = preview.filter((item) => movingIds.has(item.id));
  const fixed = preview.filter((item) => !movingIds.has(item.id) && !item.deleted);
  const previewCollision = moving.some((item) => collides(item, fixed.concat(moving.filter((other) => other.id !== item.id)), width, height, new Set([item.id])));

  return <div className="grid min-h-[min(78vh,900px)] grid-cols-1 border-y border-[var(--border)] lg:grid-cols-[250px_minmax(0,1fr)_290px]">
    <details className="border-b border-[var(--border)] lg:hidden"><summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">方块库 · {placeable.length}</summary><div className="h-64 p-2"><ContentPicker entries={placeable} value={selectedBlock} onChange={(entry) => { setSelectedBlock(entry.internal_name); setTool('place'); }} label="方块库" /></div></details>
    <aside className="hidden min-h-0 border-r border-[var(--border)] lg:flex lg:flex-col"><div className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold">方块库 <span className="font-normal text-[var(--text-muted)]">{placeable.length}</span></div><div className="min-h-0 flex-1 p-2"><ContentPicker entries={placeable} value={selectedBlock} onChange={(entry) => { setSelectedBlock(entry.internal_name); setTool('place'); }} label="方块库" /></div></aside>
    <section className="flex min-h-[360px] min-w-0 flex-col">
      <div className="flex min-h-11 flex-wrap items-center gap-1 border-b border-[var(--border)] px-2 py-1">
        <button type="button" onClick={() => setTool('select')} aria-pressed={tool === 'select'} className={`min-h-9 px-3 text-sm ${tool === 'select' ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}><Move className="mr-1 inline h-4 w-4" />选择</button>
        <button type="button" onClick={() => setMultiSelect((value) => !value)} aria-pressed={multiSelect} className={`min-h-9 px-3 text-sm ${multiSelect ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}>多选</button>
        <button type="button" disabled={!selectedPlacements.length} onClick={rotateSelected} className="min-h-9 px-3 text-sm disabled:opacity-40" title="R：旋转所选方块"><RotateCw className="mr-1 inline h-4 w-4" />旋转</button>
        <button type="button" onClick={() => onChange({ ...document, mirror_x: !document.mirror_x })} className={`min-h-9 px-3 text-sm ${document.mirror_x ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : ''}`}><FlipHorizontal className="mr-1 inline h-4 w-4" />镜像</button>
        <button type="button" disabled={!selectedPlacements.length} onClick={copySelected} className="min-h-9 px-3 text-sm disabled:opacity-40"><Copy className="mr-1 inline h-4 w-4" />复制</button>
        <button type="button" disabled={!clipboard.current.length} onClick={pasteSelected} className="min-h-9 px-3 text-sm disabled:opacity-40">粘贴</button>
        <button type="button" disabled={!selectedPlacements.length} onClick={removeSelected} className="min-h-9 px-3 text-sm text-red-600 disabled:opacity-40"><Trash2 className="mr-1 inline h-4 w-4" />删除</button>
        <button type="button" onClick={() => { const first = selectedPlacements[0]; if (first) setSelection(new Set(visiblePlacements.filter((item) => item.block === first.block).map((item) => item.id))); }} disabled={!selected} className="min-h-9 px-3 text-sm disabled:opacity-40">选择同类</button>
        <span className="ml-auto text-xs text-[var(--text-muted)]">{width}×{height} · {visiblePlacements.length} 个方块</span>
      </div>
      {unsupported.length || truncated || unsupportedConfigs ? <div role="status" className="border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"><strong>支持情况</strong><div>{truncated ? '方块列表被截断，蓝图只读。' : '已加载蓝图方块和配置。'}{unsupported.length ? ` 发现 ${unsupported.length} 个未知或 Mod 方块，Renderer 会拒绝不安全导出。${unsupported.slice(0, 4).join('、')}` : ''}{unsupportedConfigs ? ` ${unsupportedConfigs} 个配置保持只读。` : ''}</div></div> : null}
      <EditorViewport className="min-h-[360px] flex-1" contentWidth={gridWidth * CELL} contentHeight={gridHeight * CELL}>
        <svg role="grid" aria-label="蓝图画布" data-interaction-revision={interactionRevision} tabIndex={0} width={gridWidth * CELL} height={gridHeight * CELL} viewBox={`0 0 ${gridWidth} ${gridHeight}`} className="block bg-[#18212a] outline-none [touch-action:none]" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={(event) => { if (event.key.toLowerCase() === 'r' && selectedPlacements.length) { event.preventDefault(); rotateSelected(); } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPlacements.length) { event.preventDefault(); removeSelected(); } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelected(); } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelected(); } }}>
          <defs><pattern id="schematic-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#31404c" strokeWidth="0.035" /></pattern></defs>
          <rect width={gridWidth} height={gridHeight} fill="url(#schematic-grid)" />
          {displayed.map((item) => {
            const left = item.displayX + item.size_offset; const top = item.displayY + item.size_offset;
            const entry = entryFor(item.block); const isSelected = selection.has(item.id); const degrees = item.displayRotation * 90;
            return <g key={item.id} role="gridcell" aria-label={`${contentLabel(entry || { internal_name: item.block, display_name: item.block, icon: null })}，${item.displayX},${item.displayY}`} onPointerEnter={() => { if (item.id) setMessage(''); }}>
              <title>{`${entry?.display_name || item.block} · ${item.block}`}</title>
              <rect x={left + 0.08} y={top + 0.08} width={item.size - 0.16} height={item.size - 0.16} fill={entry?.icon ? '#273541' : entry?.color || '#57758a'} stroke={previewCollision ? '#ff6262' : isSelected ? '#f4d35e' : '#4c6373'} strokeWidth={previewCollision ? 0.18 : isSelected ? 0.12 : 0.06} />
              {entry?.icon ? <image href={entry.icon} x={left + 0.14} y={top + 0.14} width={item.size - 0.28} height={item.size - 0.28} preserveAspectRatio="xMidYMid meet" style={{ imageRendering: 'pixelated', pointerEvents: 'none', transformBox: 'fill-box', transformOrigin: 'center', transform: `rotate(${degrees}deg)` }} /> : null}
              {isSelected ? <rect x={left + 0.02} y={top + 0.02} width={item.size - 0.04} height={item.size - 0.04} fill="none" stroke="#ffe066" strokeWidth="0.16" pointerEvents="none" /> : null}
            </g>;
          })}
          {boxSelect.current ? <rect x={Math.min(boxSelect.current.start.x, boxSelect.current.current.x)} y={Math.min(boxSelect.current.start.y, boxSelect.current.current.y)} width={Math.abs(boxSelect.current.start.x - boxSelect.current.current.x) + 1} height={Math.abs(boxSelect.current.start.y - boxSelect.current.current.y) + 1} fill="#4ca7ff22" stroke="#4ca7ff" strokeDasharray="0.2" pointerEvents="none" /> : null}
        </svg>
      </EditorViewport>
      {previewCollision || message ? <p role="status" className="border-t border-amber-500/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{previewCollision ? '当前位置超出蓝图或与其他方块重叠。' : message}</p> : null}
      <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">点击选择，拖动移动；Shift / Ctrl 多选。触屏打开“多选”后点选，双指缩放和平移。</p>
    </section>
    <details open={mobilePropertiesOpen} onToggle={(event) => setMobilePropertiesOpen(event.currentTarget.open)} className="border-t border-[var(--border)] lg:hidden"><summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-semibold">属性{selected ? ` · ${contentLabel(entryFor(selected.block) || { internal_name: selected.block, display_name: selected.block, icon: null })}` : ''}</summary><div className="max-h-[55vh] overflow-y-auto p-3"><Properties selected={selected} catalog={catalog} document={document} onChange={onChange} fullLogic={fullLogic} /></div></details>
    <aside className="hidden min-h-0 overflow-y-auto border-l border-[var(--border)] p-3 lg:block"><div className="mb-3 border-b border-[var(--border)] pb-2 text-sm font-semibold">属性</div><Properties selected={selected} catalog={catalog} document={document} onChange={onChange} fullLogic={fullLogic} /></aside>
  </div>;
}

function Properties({ selected, catalog, document, onChange, fullLogic }: { selected: SchematicPlacement | null; catalog: EditorContentCatalog; document: SchematicDocument; onChange: (next: SchematicDocument) => void; fullLogic: boolean }) {
  if (!selected) return <p className="text-sm text-[var(--text-muted)]">选择画布上的方块以编辑属性。拖动可以移动，键盘 R 旋转、Delete 删除。</p>;
  const entry = catalog.blocks.find((item) => item.internal_name === selected.block);
  return <div className="space-y-4">
    <div className="flex items-center gap-3"><ContentIcon entry={entry} size={40} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{entry ? contentLabel(entry) : selected.block}</p><p className="truncate text-xs text-[var(--text-muted)]">{selected.block} · {selected.size}×{selected.size}</p></div></div>
    <dl className="grid grid-cols-2 gap-2 border-y border-[var(--border)] py-3 text-xs"><div><dt className="text-[var(--text-muted)]">位置</dt><dd>{selected.x}, {selected.y}</dd></div><div><dt className="text-[var(--text-muted)]">朝向</dt><dd>{selected.rotation * 90}°</dd></div><div><dt className="text-[var(--text-muted)]">类别</dt><dd>{entry?.category_name || '方块'}</dd></div><div><dt className="text-[var(--text-muted)]">配置</dt><dd>{entry?.has_config ? '可配置' : '无配置'}</dd></div></dl>
    {selected.source_x !== null && !selected.config_editable ? <p className="text-xs text-amber-700 dark:text-amber-200">该方块的原始配置不支持安全修改，保持只读。</p> : null}
    {selected.source_x !== null ? <ConfigPanel placement={selected} catalog={catalog} document={document} onChange={onChange} fullLogic={fullLogic} /> : <p className="text-sm text-[var(--text-muted)]">新放置方块会沿用游戏内默认配置。放置后可在 Mindustry 中设置。</p>}
  </div>;
}
