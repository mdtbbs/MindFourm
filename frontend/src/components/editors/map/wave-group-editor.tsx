'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import type { EditorContentCatalog, EditorContentEntry } from '@/lib/editors/editor-api';
import { ContentIcon, contentLabel } from '../shared/content-icon';
import { ContentPicker } from '../shared/content-picker';
import type { WaveGroup } from '@/lib/editors/editor-model';

const newId = () => `wave:${crypto.randomUUID()}`;
const MAX_WAVE_GROUPS = 1_000;
const defaultGroup = (unit: string, team: number): WaveGroup => ({ __editor_id: newId(), type: unit, begin: 1, end: 1, spacing: 1, max: 0, scaling: 1, shields: 0, shieldScaling: 0, amount: 1, spawn: -1, effect: 'none', payloads: [], items: { item: 'copper', amount: 0 }, team });

export function WaveGroupEditor({ groups, catalog, onChange }: { groups: WaveGroup[]; catalog: EditorContentCatalog; onChange: (next: WaveGroup[]) => void }) {
  const unitEntries = catalog.units;
  const [unitToAdd, setUnitToAdd] = useState(unitEntries[0]?.internal_name || 'dagger');
  const [advanced, setAdvanced] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const update = (index: number, patch: Record<string, unknown>) => onChange(groups.map((group, item) => item === index ? { ...group, ...patch } as WaveGroup : group));
  const add = (group?: WaveGroup) => {
    if (groups.length >= MAX_WAVE_GROUPS) { setError(`波次组最多 ${MAX_WAVE_GROUPS} 组。`); return; }
    const next = group ? { ...structuredClone(group), __editor_id: newId() } : defaultGroup(unitToAdd || catalog.units[0]?.internal_name || 'dagger', catalog.teams.find((item) => item.internal_name === 'crux')?.id ?? catalog.teams[0]?.id ?? 0);
    onChange([...groups, next]); setError('');
  };
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset; if (target < 0 || target >= groups.length) return;
    const next = [...groups]; [next[index], next[target]] = [next[target], next[index]]; onChange(next);
  };
  const chooseFrom = (entries: EditorContentEntry[], value: string, callback: (name: string) => void, label: string) => <details className="relative">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-left text-sm"><ContentIcon entry={entries.find((entry) => entry.internal_name === value)} size={26} /><span className="min-w-0 flex-1 truncate">{entries.find((entry) => entry.internal_name === value)?.display_name || '选择'}</span><span className="text-xs text-[var(--text-muted)]">选择</span></summary>
    <div className="absolute left-0 top-full z-30 mt-1 h-64 w-[min(20rem,80vw)] border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-xl"><ContentPicker entries={entries} value={value} onChange={(entry) => callback(entry.internal_name)} label={label} /></div>
  </details>;
  const numberField = (index: number, group: WaveGroup, key: string, label: string, min: number, step: number | 'any' = 1, max?: number) => <label key={key} className="block min-w-0 space-y-1 text-xs text-[var(--text-muted)]"><span>{label}</span><input type="number" min={min} max={max} step={step} value={typeof group[key] === 'number' ? Number(group[key]) : min} onChange={(event) => {
    const value = event.target.value === '' ? Number.NaN : Number(event.target.value);
    if (!Number.isFinite(value) || value < min || (max !== undefined && value > max) || (step === 1 && !Number.isInteger(value))) { setError(`${label}需要是${step === 1 ? '有效整数' : '有效数值'}。`); return; }
    update(index, { [key]: value }); setError('');
  }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base text-[var(--text)] sm:text-sm" /></label>;

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3"><div><h3 className="text-sm font-semibold">敌人波次</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{groups.length} 个波次组。导出差异最多 1,000 项。</p></div><div className="flex min-w-0 gap-2">{chooseFrom(unitEntries, unitToAdd, setUnitToAdd, '新增波次单位')}<button type="button" disabled={groups.length >= MAX_WAVE_GROUPS} onClick={() => add()} className="inline-flex min-h-11 shrink-0 items-center gap-1 bg-[var(--primary)] px-3 text-sm text-white disabled:opacity-40"><Plus className="h-4 w-4" />添加</button></div></div>
    {!groups.length ? <div className="border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">此地图还没有敌人波次，可添加第一组。</div> : null}
    <div className="space-y-3">{groups.map((group, index) => {
      const unit = unitEntries.find((entry) => entry.internal_name === group.type);
      const team = catalog.teams.find((entry) => entry.internal_name === group.team || entry.id === group.team);
      const effectName = typeof group.effect === 'string' && group.effect !== 'none' ? group.effect : '';
      const effect = catalog.statuses.find((entry) => entry.internal_name === effectName);
      const itemValue = group.items && typeof group.items === 'object' && !Array.isArray(group.items) ? group.items as Record<string, unknown> : {};
      const payloads = Array.isArray(group.payloads) ? group.payloads : [];
      const rawAdvanced = advanced.has(index);
      return <fieldset key={`${index}:${group.type}`} className="border border-[var(--border)] p-3">
        <legend className="px-1 text-xs text-[var(--text-muted)]">波次组 {index + 1}</legend>
        <div className="grid gap-3 sm:grid-cols-[minmax(11rem,1.1fr)_repeat(3,minmax(6rem,1fr))]">
          <div className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">敌人单位</span>{chooseFrom(unitEntries, group.type, (name) => update(index, { type: name }), `第 ${index + 1} 组的单位`)}<span className="block truncate font-mono text-[10px] text-[var(--text-muted)]">{unit?.internal_name || group.type}</span></div>
          {numberField(index, group, 'begin', '开始波次', 1, 1, 5_000)}
          {numberField(index, group, 'end', '结束波次', 1, 1, 5_000)}
          {numberField(index, group, 'amount', '每次数量', 1, 1, 10_000)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {numberField(index, group, 'spacing', '召唤间隔', 1, 1, 100_000)}
          {numberField(index, group, 'scaling', '数量增长', 0, 'any', 10_000)}
          {numberField(index, group, 'shields', '初始护盾', 0, 'any', 10_000_000)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-xs text-[var(--text-muted)]"><span>队伍</span><select value={typeof group.team === 'number' ? group.team : team?.id ?? catalog.teams[0]?.id ?? 0} onChange={(event) => update(index, { team: Number(event.target.value) })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm">{catalog.teams.filter((entry) => Number.isInteger(entry.id)).map((entry) => <option key={entry.internal_name} value={entry.id}>{contentLabel(entry)}</option>)}</select></label>
          <div className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">状态效果</span>{chooseFrom(catalog.statuses, effectName, (name) => update(index, { effect: name || 'none' }), `第 ${index + 1} 组状态效果`)}<button type="button" onClick={() => update(index, { effect: 'none' })} className="text-xs text-[var(--primary)]">清除效果{effect ? ` · ${effect.display_name}` : ''}</button></div>
          {numberField(index, group, 'spawn', '出生点序号', -1, 1, 5_000)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ItemCarryEditor itemValue={itemValue} catalog={catalog} onChange={(items) => update(index, { items })} />
          <PayloadEditor payloads={payloads} catalog={catalog} onChange={(next) => update(index, { payloads: next })} />
        </div>
        <button type="button" onClick={() => setAdvanced((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm text-[var(--primary)]">{rawAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{rawAdvanced ? '收起高级原始数据' : '高级原始数据'}</button>
        {rawAdvanced ? <details className="mt-2 border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-xs text-[var(--text-muted)]">查看或编辑此组 JSON</summary><RawGroupEditor group={group} onChange={(value) => update(index, value)} /></details> : null}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="flex min-h-10 min-w-10 items-center justify-center border border-[var(--border)]" aria-label="上移波次组"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" disabled={index === groups.length - 1} onClick={() => move(index, 1)} className="flex min-h-10 min-w-10 items-center justify-center border border-[var(--border)]" aria-label="下移波次组"><ChevronDown className="h-4 w-4" /></button>
          <button type="button" onClick={() => add(group)} className="inline-flex min-h-10 items-center gap-1 border border-[var(--border)] px-3 text-sm"><Copy className="h-4 w-4" />复制</button>
          <button type="button" onClick={() => onChange(groups.filter((_, item) => item !== index))} className="inline-flex min-h-10 items-center gap-1 border border-red-500/40 px-3 text-sm text-red-700 dark:text-red-300"><Trash2 className="h-4 w-4" />删除</button>
        </div>
      </fieldset>;
    })}</div>
    {error ? <p role="alert" className="border border-red-500/30 p-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
  </section>;
}

function ItemCarryEditor({ itemValue, catalog, onChange }: { itemValue: Record<string, unknown>; catalog: EditorContentCatalog; onChange: (value: Record<string, unknown>) => void }) {
  const [selectedItem, setSelectedItem] = useState(catalog.items[0]?.internal_name || 'copper');
  const [amount, setAmount] = useState(10);
  const name = typeof itemValue.item === 'string' ? itemValue.item : '';
  const carried = Number.isInteger(itemValue.amount) ? Number(itemValue.amount) : 0;
  const update = (nextName: string, count: number) => onChange({ item: nextName, amount: count });
  return <section className="space-y-2 border border-[var(--border)] p-2"><h4 className="text-xs font-medium">携带物品</h4><div className="flex items-center gap-2"><ContentIcon entry={catalog.items.find((entry) => entry.internal_name === name)} size={24} /><span className="min-w-0 flex-1 truncate text-xs">{name ? catalog.items.find((entry) => entry.internal_name === name)?.display_name || name : '无携带物品'}</span><input aria-label="携带物品数量" type="number" min={0} max={1_000_000} value={carried} onChange={(event) => update(name || selectedItem, Math.max(0, Math.min(1_000_000, Number(event.target.value) || 0)))} className="h-9 w-20 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm" /></div><div className="flex min-w-0 gap-2">{contentMenu(catalog.items, selectedItem, setSelectedItem, '选择携带物品')}<input aria-label="新增携带物品数量" type="number" min={0} max={1_000_000} value={amount} onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))} className="h-11 w-20 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm" /><button type="button" onClick={() => update(selectedItem, amount)} className="min-h-11 shrink-0 border border-[var(--border)] px-2 text-xs">设置物品</button></div></section>;
}

function PayloadEditor({ payloads, catalog, onChange }: { payloads: unknown[]; catalog: EditorContentCatalog; onChange: (value: string[]) => void }) {
  const [selectedUnit, setSelectedUnit] = useState(catalog.units[0]?.internal_name || 'dagger');
  const [amount, setAmount] = useState(1);
  const counts = new Map<string, number>();
  for (const item of payloads) if (typeof item === 'string') counts.set(item, (counts.get(item) || 0) + 1);
  const update = (name: string, count: number) => { const next: string[] = []; for (const [unit, total] of counts) if (unit !== name) next.push(...Array.from({ length: Math.min(total, 100) }, () => unit)); next.push(...Array.from({ length: Math.max(0, Math.min(100, count)) }, () => name)); onChange(next); };
  return <section className="space-y-2 border border-[var(--border)] p-2"><h4 className="text-xs font-medium">单位载荷</h4>{[...counts].map(([name, count]) => <div key={name} className="flex items-center gap-2"><ContentIcon entry={catalog.units.find((entry) => entry.internal_name === name)} size={24} /><span className="min-w-0 flex-1 truncate text-xs">{catalog.units.find((entry) => entry.internal_name === name)?.display_name || name}</span><input aria-label="单位载荷数量" type="number" min={0} max={100} value={count} onChange={(event) => update(name, Number(event.target.value) || 0)} className="h-9 w-20 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm" /><button type="button" onClick={() => update(name, 0)} className="px-2 text-xs text-red-600">移除</button></div>)}<div className="flex min-w-0 gap-2">{contentMenu(catalog.units, selectedUnit, setSelectedUnit, '选择载荷单位')}<input aria-label="单位载荷数量" type="number" min={1} max={100} value={amount} onChange={(event) => setAmount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="h-11 w-20 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm" /><button type="button" onClick={() => update(selectedUnit, (counts.get(selectedUnit) || 0) + amount)} className="min-h-11 shrink-0 border border-[var(--border)] px-2 text-xs">设置数量</button></div></section>;
}

function contentMenu(entries: EditorContentEntry[], value: string, onChange: (name: string) => void, label: string) {
  return <details className="relative min-w-0 flex-1"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm"><ContentIcon entry={entries.find((item) => item.internal_name === value)} size={26} /><span className="min-w-0 flex-1 truncate">{entries.find((item) => item.internal_name === value)?.display_name || '选择内容'}</span></summary><div className="absolute left-0 top-full z-30 mt-1 h-64 w-[min(20rem,80vw)] border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-xl"><ContentPicker entries={entries} value={value} onChange={(entry) => onChange(entry.internal_name)} label={label} /></div></details>;
}

function RawGroupEditor({ group, onChange }: { group: WaveGroup; onChange: (next: Record<string, unknown>) => void }) {
  const [value, setValue] = useState(JSON.stringify(group, null, 2));
  const [error, setError] = useState('');
  return <div className="mt-2 space-y-2"><textarea value={value} onChange={(event) => { setValue(event.target.value); try { const parsed = JSON.parse(event.target.value) as unknown; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); onChange(parsed as Record<string, unknown>); setError(''); } catch { setError('JSON 尚未完整解析；上一次有效值会保留。'); } }} rows={10} className="w-full border border-[var(--border)] bg-[var(--bg-page)] p-3 font-mono text-xs" />{error ? <p role="alert" className="text-xs text-amber-700">{error}</p> : null}</div>;
}
