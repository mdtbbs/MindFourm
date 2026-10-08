'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import WaveTimeline from './wave-timeline';
import ContentPicker, { useEditorCatalog } from './content-picker';
import { useEditorHistory } from './editor-history';
import { spawnedAt, WAVE_TEMPLATES, payloadRows, payloadValues } from './wave-model';
import { downloadEditorFile } from './editor-source';
import type { ResourceV2MapTransformInput } from '@/lib/api/v1/resources';

type WaveGroup = Record<string, unknown>;
type WaveOperation = NonNullable<ResourceV2MapTransformInput['wave_operations']>[number];

type Props = {
  groups: WaveGroup[];
  disabled?: boolean;
  onGroupsChange: (groups: WaveGroup[]) => void;
  onOperation: (operation: WaveOperation) => void;
  operations?: WaveOperation[];
  onOperationsReplace?: (operations: WaveOperation[]) => void;
  history?: ReturnType<typeof useEditorHistory>;
};

const NUMERIC_FIELDS = [
  ['begin', '开始波次', 0], ['end', '结束波次', 0], ['spacing', '间隔', 1], ['amount', '初始数量', 0],
  ['max', '数量上限', 0], ['scaling', '每增加一单位需几次出场', 0], ['shields', '初始护盾', 0], ['shieldScaling', '护盾增长', 0],
  ['spawn', '出生点', -1], ['team', '队伍 ID', 0],
] as const;

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export default function WaveEditor({ groups, disabled = false, onGroupsChange, onOperation, operations = [], onOperationsReplace, history: sharedHistory }: Props) {
  const { items: catalog } = useEditorCatalog();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchKey, setBatchKey] = useState('begin');
  const [batchValue, setBatchValue] = useState('0');
  const [template, setTemplate] = useState('简单生存');
  const [previewCount, setPreviewCount] = useState(10);
  const [previewWave, setPreviewWave] = useState(1);
  const [bossOnly, setBossOnly] = useState(false);
  const groupRefs = useRef(new Map<number, HTMLFieldSetElement>());
  const [shownCount, setShownCount] = useState(40);
  const ownHistory = useEditorHistory({ groups, operations }, previous => { onGroupsChange(previous.groups); onOperationsReplace?.(previous.operations); });
  const history = sharedHistory || ownHistory;
  const remember = () => { if (!sharedHistory) ownHistory.remember(); };
  const contentName = (value: unknown) => catalog.find(item => item.type === 'unit' && item.name === value)?.label || String(value || '单位');
  const [advanced, setAdvanced] = useState<Record<number, boolean>>({});
  const [importError, setImportError] = useState('');
  const [validation, setValidation] = useState<Record<string, string>>({});
  const countLabel = useMemo(() => `${groups.length} 个波次组`, [groups.length]);

  const update = (index: number, fields: Record<string, unknown>) => {
    remember();
    onGroupsChange(groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...fields } : group));
    onOperation({ action: 'update', index, fields });
  };

  const updateNumber = (index: number, key: string, raw: string, min: number) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < min) return;
    const fieldValue = key === 'begin' || key === 'end' ? numeric - 1 : numeric;
    if (fieldValue < 0) return;
    update(index, { [key]: fieldValue });
  };

  const move = (index: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= groups.length || index === toIndex) return;
    remember();
    const next = [...groups];
    const [group] = next.splice(index, 1);
    next.splice(toIndex, 0, group);
    onGroupsChange(next);
    onOperation({ action: 'move', index, to_index: toIndex });
  };

  const remove = (index: number) => {
    remember();
    onGroupsChange(groups.filter((_group, groupIndex) => groupIndex !== index));
    onOperation({ action: 'delete', index });
  };

  const add = (source?: WaveGroup) => {
    if (groups.length >= 5_000) return;
    remember();
    const fields = source ? sanitizeClone(source) : { type: 'dagger', begin: 0, end: 39, spacing: 1, amount: 1, scaling: 1 };
    const index = groups.length;
    onGroupsChange([...groups, fields]);
    onOperation({ action: 'add', index, fields });
  };

  const changeJsonField = (index: number, key: 'payloads' | 'items', value: string) => {
    const validationKey = `${index}:${key}`;
    try {
      const parsed = value.trim() ? JSON.parse(value) : key === 'payloads' ? [] : undefined;
      if (key === 'payloads' && !Array.isArray(parsed)) throw new Error('需要 JSON 数组，例如 ["flare"]');
      if (key === 'items' && parsed !== undefined && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('需要 JSON 对象，例如 {"item":"copper","amount":10}');
      setValidation((current) => ({ ...current, [validationKey]: '' }));
      if (parsed !== undefined) update(index, { [key]: parsed });
    } catch (error) {
      setValidation((current) => ({ ...current, [validationKey]: error instanceof Error ? error.message : 'JSON 格式错误' }));
    }
  };

  const applyTemplate = () => {
    if (groups.length + operations.length > 950) { setValidation(current => ({ ...current, batch: '操作数量超过安全上限，请先导出后重新打开地图' })); return; }
    remember(); const next = WAVE_TEMPLATES[template].map(group => ({ ...group }));
    for (let i = groups.length - 1; i >= 0; i--) onOperation({ action: 'delete', index: i });
    next.forEach((fields, index) => onOperation({ action: 'add', index, fields })); onGroupsChange(next); setSelected(new Set());
  };
  const batchEdit = () => {
    let value: unknown = ['effect', 'team', 'spawn'].includes(batchKey) && batchKey === 'effect' ? batchValue : Number(batchValue);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < (batchKey === 'spawn' ? -1 : 0))) return;
    if (batchKey === 'begin' || batchKey === 'end') { if (Number(value) < 1) return; value = Number(value) - 1; }
    remember(); onGroupsChange(groups.map((group, index) => selected.has(index) ? { ...group, [batchKey]: value } : group));
    selected.forEach(index => onOperation({ action: 'update', index, fields: { [batchKey]: value } }));
  };
  const importWaves = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('波次配置最多 1 MB');
      const value = JSON.parse(await file.text()); const incoming = Array.isArray(value) ? value : value.groups;
      if (groups.length + operations.length + (Array.isArray(incoming) ? incoming.length : 0) > 1000) throw new Error('改动超过安全上限，请先导出地图再继续');
      if (!Array.isArray(incoming) || incoming.length > 500 || incoming.some(group => !group || typeof group !== 'object' || Array.isArray(group) || typeof group.type !== 'string')) throw new Error('配置格式无效，最多导入 500 个波次组');
      remember();
      const next = incoming.map(group => sanitizeClone(group));
      onGroupsChange(next);
      const changes: WaveOperation[] = [...groups.map((_, index) => ({ action: 'delete' as const, index })).reverse(), ...next.map((fields, index) => ({ action: 'add' as const, index, fields }))];
      if (onOperationsReplace) onOperationsReplace([...operations, ...changes]); else changes.forEach(onOperation);
      setSelected(new Set()); setImportError('');
    } catch (error) { setImportError(error instanceof Error ? error.message : '配置读取失败'); }
  };
  return <section onKeyDown={history.onKeyDown} className="min-w-0 space-y-3 border border-[var(--border)] p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="text-sm font-semibold text-[var(--text)]">波次编辑器</h4><p className="mt-1 text-xs text-[var(--text-muted)]">{countLabel}。支持单位、波次区间、数量、增长、护盾、出生点、状态效果、载荷和携带物品。</p></div>
      <button type="button" disabled={disabled || groups.length >= 5_000} onClick={() => add()} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><Plus className="h-4 w-4" />添加波次组</button>
    </div>

    <div className="flex flex-wrap gap-2"><label className="flex min-h-11 cursor-pointer items-center border border-[var(--border)] px-3 text-sm">导入波次配置<input type="file" aria-label="导入波次配置" accept=".json" disabled={disabled} onChange={event => void importWaves(event.target.files?.[0])} className="sr-only" /></label><button type="button" onClick={() => downloadEditorFile(new Blob([JSON.stringify({ schema: 'mindustry-waves-v1', groups }, null, 2)], { type: 'application/json' }), 'waves.json')} className="min-h-11 border border-[var(--border)] px-3 text-sm">下载波次配置</button>{importError ? <p role="alert" className="text-sm text-red-600">{importError}</p> : null}<button type="button" disabled={disabled || !history.canUndo} onClick={history.undo} className="min-h-11 border border-[var(--border)] px-3 text-sm">撤销</button><button type="button" disabled={disabled || !history.canRedo} onClick={history.redo} className="min-h-11 border border-[var(--border)] px-3 text-sm">重做</button><select aria-label="波次模板" value={template} onChange={event => setTemplate(event.target.value)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm">{Object.keys(WAVE_TEMPLATES).map(name => <option key={name}>{name}</option>)}</select><button type="button" disabled={disabled} onClick={applyTemplate} className="min-h-11 border border-[var(--border)] px-3 text-sm">应用模板（替换当前波次）</button></div>
    <WaveTimeline groups={groups} disabled={disabled} name={contentName} onUpdate={update} onLocate={index => { setShownCount(count => Math.max(count,index+1)); setTimeout(() => groupRefs.current.get(index)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),0); }} />
    <section className="space-y-2 border border-[var(--border)] p-3"><h5 className="text-sm font-semibold">实际波次预览</h5><div className="flex flex-wrap gap-2"><select aria-label="预览波次数" value={previewCount} onChange={event => setPreviewCount(Number(event.target.value))} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm"><option value={10}>前 10 波</option><option value={20}>前 20 波</option><option value={1}>指定波次</option></select>{previewCount === 1 ? <input aria-label="指定波次" type="number" min={1} value={previewWave} onChange={event => setPreviewWave(Math.max(1, Number(event.target.value) || 1))} className="min-h-11 w-28 border border-[var(--border)] bg-[var(--bg-card)] px-2" /> : null}<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={bossOnly} onChange={event => setBossOnly(event.target.checked)} />只看 Boss</label></div><ol className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">{Array.from({ length: previewCount }, (_, i) => previewCount === 1 ? previewWave : i + 1).map(wave => <li key={wave} className="border border-[var(--border)] p-2 text-sm"><strong>第 {wave} 波</strong>{groups.filter(group => !bossOnly || group.effect === 'boss').map((group, index) => { const count = spawnedAt(group, wave); return count ? <p key={index}>{contentName(group.type)} × {count}</p> : null; })}</li>)}</ol><p className="text-xs text-[var(--text-muted)]">按官方生成数量公式预览；队伍、出生点和地图规则会影响游戏实际出场。</p></section>
    {selected.size ? <div className="flex flex-wrap items-center gap-2 border border-[var(--border)] p-3"><span className="text-sm">已选 {selected.size} 组</span><select aria-label="批量字段" value={batchKey} onChange={event => setBatchKey(event.target.value)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-2">{NUMERIC_FIELDS.filter(([key]) => !['amount', 'max'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="effect">状态效果</option></select><input aria-label="批量值" value={batchValue} onChange={event => setBatchValue(event.target.value)} className="min-h-11 w-28 border border-[var(--border)] bg-[var(--bg-card)] px-2" /><button type="button" disabled={disabled} onClick={batchEdit} className="min-h-11 border border-[var(--border)] px-3 text-sm">应用到所选组</button></div> : null}
    {validation.batch ? <ErrorText>{validation.batch}</ErrorText> : null}
    {!groups.length ? <div className="border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--text-muted)]">当前地图没有波次组，可以直接添加。</div> : null}

    <div className="space-y-3">{groups.slice(0, shownCount).map((group, index) => {
      const showAdvanced = Boolean(advanced[index]);
      return <fieldset ref={element => { if (element) groupRefs.current.set(index, element); else groupRefs.current.delete(index); }} key={index} className="border border-[var(--border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[var(--text-muted)]"><label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`选择波次组 ${index + 1}`} checked={selected.has(index)} onChange={event => setSelected(current => { const next = new Set(current); event.target.checked ? next.add(index) : next.delete(index); return next; })} />#{index + 1}</label></legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="单位"><ContentPicker type="unit" value={typeof group.type === 'string' ? group.type : ''} disabled={disabled} onChange={name => update(index, { type: name })} label="选择单位" /></Field>
          {NUMERIC_FIELDS.slice(0, 7).map(([key, label, min]) => <Field key={key} label={label}><input type="number" min={min} step={key === 'scaling' || key === 'shields' || key === 'shieldScaling' ? 'any' : 1} placeholder={key === 'end' ? '不限' : key === 'scaling' ? '不增长' : undefined} value={(key === 'end' || key === 'scaling') && numberValue(group[key], 2147483647) === 2147483647 ? '' : numberValue(group[key], key === 'spacing' || key === 'amount' ? 1 : key === 'max' ? 40 : 0) + (key === 'begin' || key === 'end' ? 1 : 0)} disabled={disabled} onChange={(event) => { if (!event.target.value && (key === 'end' || key === 'scaling')) update(index, { [key]: 2147483647 }); else updateNumber(index, key, event.target.value, min); }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>)}
        </div>

        <button type="button" onClick={() => setAdvanced((current) => ({ ...current, [index]: !showAdvanced }))} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--primary)]">{showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{showAdvanced ? '收起高级字段' : '展开高级字段'}</button>

        {showAdvanced ? <div className="mt-2 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {NUMERIC_FIELDS.slice(7).map(([key, label, min]) => <Field key={key} label={label}><input type="number" min={min} value={numberValue(group[key], key === 'spawn' ? -1 : 0)} disabled={disabled} onChange={(event) => { if (!event.target.value && (key === 'end' || key === 'scaling')) update(index, { [key]: 2147483647 }); else updateNumber(index, key, event.target.value, min); }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>)}
          <Field label="状态效果"><ContentPicker type="status" value={typeof group.effect === 'string' ? group.effect : 'none'} disabled={disabled} onChange={name => update(index, { effect: name })} label="选择状态效果" /></Field>
          <div className="space-y-2 sm:col-span-2"><h5 className="text-xs text-[var(--text-muted)]">携带载荷</h5>{payloadRows(group.payloads).map((row, rowIndex) => <div key={rowIndex} className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] gap-2"><ContentPicker type="unit" value={row.type} disabled={disabled} label="选择载荷单位" onChange={name => { const rows = payloadRows(group.payloads); rows[rowIndex].type = name; update(index, { payloads: payloadValues(rows) }); }} /><input aria-label={`载荷 ${rowIndex + 1} 数量`} type="number" min={0} max={100} value={row.amount} disabled={disabled} onChange={event => { const rows = payloadRows(group.payloads); rows[rowIndex].amount = Number(event.target.value); update(index, { payloads: payloadValues(rows) }); }} className="min-h-11 w-full self-start border border-[var(--border)] bg-[var(--bg-card)] px-2" /><button type="button" disabled={disabled} onClick={() => update(index, { payloads: payloadValues(payloadRows(group.payloads).filter((_, i) => i !== rowIndex)) })} className="min-h-11 self-start border border-[var(--border)]">删除</button></div>)}<button type="button" disabled={disabled} onClick={() => update(index, { payloads: [...(Array.isArray(group.payloads) ? group.payloads : []), 'dagger'].slice(0, 100) })} className="min-h-11 border border-[var(--border)] px-3 text-sm">添加单位载荷</button><p className="text-xs text-[var(--text-muted)]">官方波次格式仅支持单位载荷；游戏中只有载荷单位能携带。</p></div>
          <div className="space-y-2 sm:col-span-2"><h5 className="text-xs text-[var(--text-muted)]">携带物品</h5><ContentPicker type="item" value={String((group.items as { item?: string } | undefined)?.item || 'copper')} disabled={disabled} onChange={name => update(index, { items: { item: name, amount: Number((group.items as { amount?: number } | undefined)?.amount || 0) } })} label="选择携带物品" /><input aria-label="携带物品数量" type="number" min={0} max={1000000} value={Number((group.items as { amount?: number } | undefined)?.amount || 0)} disabled={disabled} onChange={event => update(index, { items: { item: String((group.items as { item?: string } | undefined)?.item || 'copper'), amount: Number(event.target.value) } })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3" /></div>
          <details className="sm:col-span-2"><summary className="min-h-11 cursor-pointer text-xs text-[var(--text-muted)]">原始数据（高级）</summary><Field label="载荷 JSON"><textarea key={JSON.stringify(group.payloads)} defaultValue={JSON.stringify(Array.isArray(group.payloads) ? group.payloads : [])} disabled={disabled} onBlur={event => changeJsonField(index, 'payloads', event.target.value)} className="min-h-24 w-full border border-[var(--border)] bg-[var(--bg-card)] p-3 font-mono text-sm" />{validation[`${index}:payloads`] ? <ErrorText>{validation[`${index}:payloads`]}</ErrorText> : null}</Field></details>
        </div> : null}

        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" disabled={disabled || index === 0} onClick={() => move(index, index - 1)} className="flex min-h-11 min-w-11 items-center justify-center border border-[var(--border)] px-3 text-sm"><ChevronUp className="h-4 w-4" /><span className="sr-only">上移</span></button>
          <button type="button" disabled={disabled || index === groups.length - 1} onClick={() => move(index, index + 1)} className="flex min-h-11 min-w-11 items-center justify-center border border-[var(--border)] px-3 text-sm"><ChevronDown className="h-4 w-4" /><span className="sr-only">下移</span></button>
          <button type="button" disabled={disabled} onClick={() => add(group)} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><Copy className="h-4 w-4" />复制</button>
          <button type="button" disabled={disabled} onClick={() => remove(index)} className="inline-flex min-h-11 items-center gap-2 border border-red-500/40 px-3 text-sm text-red-700 dark:text-red-300"><Trash2 className="h-4 w-4" />删除</button>
        </div>
      </fieldset>;
    })}</div>
    {groups.length > shownCount ? <button type="button" onClick={() => setShownCount(value => value + 40)} className="min-h-11 border border-[var(--border)] px-3 text-sm">加载更多波次组</button> : null}
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0 space-y-1 text-xs text-[var(--text-muted)]"><span className="block">{label}</span>{children}</label>;
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-xs text-red-600">{children}</span>;
}

function sanitizeClone(group: WaveGroup): WaveGroup {
  const allowed = ['type', 'begin', 'end', 'spacing', 'max', 'scaling', 'shields', 'shieldScaling', 'amount', 'spawn', 'effect', 'payloads', 'items', 'team'];
  return Object.fromEntries(allowed.flatMap((key) => Object.prototype.hasOwnProperty.call(group, key) ? [[key, group[key]]] : []));
}
