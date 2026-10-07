'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import type { ResourceV2MapTransformInput } from '@/lib/api/v1/resources';

type WaveGroup = Record<string, unknown>;
type WaveOperation = NonNullable<ResourceV2MapTransformInput['wave_operations']>[number];

type Props = {
  groups: WaveGroup[];
  disabled?: boolean;
  onGroupsChange: (groups: WaveGroup[]) => void;
  onOperation: (operation: WaveOperation) => void;
};

const NUMERIC_FIELDS = [
  ['begin', '开始波次', 0], ['end', '结束波次', 0], ['spacing', '间隔', 1], ['amount', '初始数量', 0],
  ['max', '数量上限', 0], ['scaling', '数量增长', 0], ['shields', '初始护盾', 0], ['shieldScaling', '护盾增长', 0],
  ['spawn', '出生点', -1], ['team', '队伍 ID', 0],
] as const;

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export default function WaveEditor({ groups, disabled = false, onGroupsChange, onOperation }: Props) {
  const [advanced, setAdvanced] = useState<Record<number, boolean>>({});
  const [validation, setValidation] = useState<Record<string, string>>({});
  const countLabel = useMemo(() => `${groups.length} 个波次组`, [groups.length]);

  const update = (index: number, fields: Record<string, unknown>) => {
    onGroupsChange(groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...fields } : group));
    onOperation({ action: 'update', index, fields });
  };

  const updateNumber = (index: number, key: string, raw: string, min: number) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < min) return;
    update(index, { [key]: Number.isInteger(numeric) ? numeric : numeric });
  };

  const move = (index: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= groups.length || index === toIndex) return;
    const next = [...groups];
    const [group] = next.splice(index, 1);
    next.splice(toIndex, 0, group);
    onGroupsChange(next);
    onOperation({ action: 'move', index, to_index: toIndex });
  };

  const remove = (index: number) => {
    onGroupsChange(groups.filter((_group, groupIndex) => groupIndex !== index));
    onOperation({ action: 'delete', index });
  };

  const add = (source?: WaveGroup) => {
    if (groups.length >= 5_000) return;
    const fields = source ? sanitizeClone(source) : { type: 'dagger', begin: 1, end: 40, spacing: 1, amount: 1, scaling: 1 };
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

  return <section className="space-y-3 border border-[var(--border)] p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="text-sm font-semibold text-[var(--text)]">波次编辑器</h4><p className="mt-1 text-xs text-[var(--text-muted)]">{countLabel}。支持单位、波次区间、数量、缩放、护盾、出生点、状态效果、载荷和携带物品。</p></div>
      <button type="button" disabled={disabled || groups.length >= 5_000} onClick={() => add()} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><Plus className="h-4 w-4" />添加波次组</button>
    </div>

    {!groups.length ? <div className="border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--text-muted)]">当前地图没有波次组，可以直接添加。</div> : null}

    <div className="space-y-3">{groups.map((group, index) => {
      const showAdvanced = Boolean(advanced[index]);
      return <fieldset key={`${index}:${String(group.type || 'unknown')}`} className="border border-[var(--border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[var(--text-muted)]">#{index + 1}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="单位"><input value={typeof group.type === 'string' ? group.type : ''} disabled={disabled} onChange={(event) => update(index, { type: event.target.value.trim() })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" placeholder="dagger" /></Field>
          {NUMERIC_FIELDS.slice(0, 7).map(([key, label, min]) => <Field key={key} label={label}><input type="number" min={min} step={key === 'scaling' || key === 'shields' || key === 'shieldScaling' ? 'any' : 1} value={numberValue(group[key], key === 'spacing' ? 1 : 0)} disabled={disabled} onChange={(event) => updateNumber(index, key, event.target.value, min)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>)}
        </div>

        <button type="button" onClick={() => setAdvanced((current) => ({ ...current, [index]: !showAdvanced }))} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--primary)]">{showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{showAdvanced ? '收起高级字段' : '展开高级字段'}</button>

        {showAdvanced ? <div className="mt-2 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {NUMERIC_FIELDS.slice(7).map(([key, label, min]) => <Field key={key} label={label}><input type="number" min={min} value={numberValue(group[key], key === 'spawn' ? -1 : 0)} disabled={disabled} onChange={(event) => updateNumber(index, key, event.target.value, min)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>)}
          <Field label="状态效果"><input value={typeof group.effect === 'string' ? group.effect : ''} disabled={disabled} onChange={(event) => update(index, { effect: event.target.value.trim() })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" placeholder="none / overdrive" /></Field>
          <Field label="载荷单位 JSON"><textarea defaultValue={JSON.stringify(Array.isArray(group.payloads) ? group.payloads : [])} disabled={disabled} onBlur={(event) => changeJsonField(index, 'payloads', event.target.value)} className="min-h-24 w-full border border-[var(--border)] bg-[var(--bg-card)] p-3 font-mono text-sm" />{validation[`${index}:payloads`] ? <ErrorText>{validation[`${index}:payloads`]}</ErrorText> : null}</Field>
          <Field label="携带物品 JSON"><textarea defaultValue={group.items ? JSON.stringify(group.items) : ''} disabled={disabled} onBlur={(event) => changeJsonField(index, 'items', event.target.value)} className="min-h-24 w-full border border-[var(--border)] bg-[var(--bg-card)] p-3 font-mono text-sm" placeholder='{"item":"copper","amount":10}' />{validation[`${index}:items`] ? <ErrorText>{validation[`${index}:items`]}</ErrorText> : null}</Field>
        </div> : null}

        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" disabled={disabled || index === 0} onClick={() => move(index, index - 1)} className="flex min-h-11 min-w-11 items-center justify-center border border-[var(--border)] px-3 text-sm"><ChevronUp className="h-4 w-4" /><span className="sr-only">上移</span></button>
          <button type="button" disabled={disabled || index === groups.length - 1} onClick={() => move(index, index + 1)} className="flex min-h-11 min-w-11 items-center justify-center border border-[var(--border)] px-3 text-sm"><ChevronDown className="h-4 w-4" /><span className="sr-only">下移</span></button>
          <button type="button" disabled={disabled} onClick={() => add(group)} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><Copy className="h-4 w-4" />复制</button>
          <button type="button" disabled={disabled} onClick={() => remove(index)} className="inline-flex min-h-11 items-center gap-2 border border-red-500/40 px-3 text-sm text-red-700 dark:text-red-300"><Trash2 className="h-4 w-4" />删除</button>
        </div>
      </fieldset>;
    })}</div>
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
