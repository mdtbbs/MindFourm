'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import WaveTimeline from './wave-timeline';
import ContentPicker, { useEditorCatalog } from './content-picker';
import { useEditorHistory } from './editor-history';
import { spawnedAt, WAVE_TEMPLATES, WAVE_TEMPLATE_KEYS, payloadRows, payloadValues } from './wave-model';
import { useI18n } from '@/i18n/provider';
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
  ['begin', 'editor.fieldBegin', 0], ['end', 'editor.fieldEnd', 0], ['spacing', 'editor.fieldSpacing', 1], ['amount', 'editor.fieldAmount', 0],
  ['max', 'editor.fieldMax', 0], ['scaling', 'editor.fieldScaling', 0], ['shields', 'editor.fieldShields', 0], ['shieldScaling', 'editor.fieldShieldScaling', 0],
  ['spawn', 'editor.fieldSpawn', -1], ['team', 'editor.fieldTeam', 0],
] as const;

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export default function WaveEditor({ groups, disabled = false, onGroupsChange, onOperation, operations = [], onOperationsReplace, history: sharedHistory }: Props) {
  const { t } = useI18n();
  const { items: catalog } = useEditorCatalog();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchKey, setBatchKey] = useState('begin');
  const [batchValue, setBatchValue] = useState('0');
  const [template, setTemplate] = useState('easy');
  const [previewCount, setPreviewCount] = useState(10);
  const [previewWave, setPreviewWave] = useState(1);
  const [bossOnly, setBossOnly] = useState(false);
  const groupRefs = useRef(new Map<number, HTMLFieldSetElement>());
  const [shownCount, setShownCount] = useState(40);
  const ownHistory = useEditorHistory({ groups, operations }, previous => { onGroupsChange(previous.groups); onOperationsReplace?.(previous.operations); });
  const history = sharedHistory || ownHistory;
  const remember = () => { if (!sharedHistory) ownHistory.remember(); };
  const contentName = (value: unknown) => catalog.find(item => item.type === 'unit' && item.name === value)?.label || String(value || t('editor.unitFallback'));
  const [advanced, setAdvanced] = useState<Record<number, boolean>>({});
  const [importError, setImportError] = useState('');
  const [validation, setValidation] = useState<Record<string, string>>({});
  const countLabel = useMemo(() => t('editor.waveGroups', { count: groups.length }), [groups.length, t]);

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
      if (key === 'payloads' && !Array.isArray(parsed)) throw new Error(t('editor.payloadNeedsArray'));
      if (key === 'items' && parsed !== undefined && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error(t('editor.itemsNeedObject'));
      setValidation((current) => ({ ...current, [validationKey]: '' }));
      if (parsed !== undefined) update(index, { [key]: parsed });
    } catch (error) {
      setValidation((current) => ({ ...current, [validationKey]: error instanceof Error ? error.message : t('editor.jsonInvalid') }));
    }
  };

  const applyTemplate = () => {
    if (groups.length + operations.length > 950) { setValidation(current => ({ ...current, batch: t('editor.tooManyOps') })); return; }
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
      if (file.size > 1024 * 1024) throw new Error(t('editor.importTooLarge'));
      const value = JSON.parse(await file.text()); const incoming = Array.isArray(value) ? value : value.groups;
      if (groups.length + operations.length + (Array.isArray(incoming) ? incoming.length : 0) > 1000) throw new Error(t('editor.changeLimit'));
      if (!Array.isArray(incoming) || incoming.length > 500 || incoming.some(group => !group || typeof group !== 'object' || Array.isArray(group) || typeof group.type !== 'string')) throw new Error(t('editor.importTooManyGroups'));
      remember();
      const next = incoming.map(group => sanitizeClone(group));
      onGroupsChange(next);
      const changes: WaveOperation[] = [...groups.map((_, index) => ({ action: 'delete' as const, index })).reverse(), ...next.map((fields, index) => ({ action: 'add' as const, index, fields }))];
      if (onOperationsReplace) onOperationsReplace([...operations, ...changes]); else changes.forEach(onOperation);
      setSelected(new Set()); setImportError('');
    } catch (error) { setImportError(error instanceof Error ? error.message : t('editor.importFailed')); }
  };
  return <section onKeyDown={history.onKeyDown} className="min-w-0 space-y-3 border border-[var(--border)] p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="text-sm font-semibold text-[var(--text)]">{t('editor.waveEditorTitle')}</h4><p className="mt-1 text-xs text-[var(--text-muted)]">{t('editor.waveIntro', { groups: countLabel })}</p></div>
      <button type="button" disabled={disabled || groups.length >= 5_000} onClick={() => add()} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><Plus className="h-4 w-4" />{t('editor.addWaveGroup')}</button>
    </div>

    <div className="flex flex-wrap gap-2"><label className="flex min-h-11 cursor-pointer items-center border border-[var(--border)] px-3 text-sm">{t('editor.importWaveConfig')}<input type="file" aria-label={t('editor.importWaveConfig')} accept=".json" disabled={disabled} onChange={event => void importWaves(event.target.files?.[0])} className="sr-only" /></label><button type="button" onClick={() => downloadEditorFile(new Blob([JSON.stringify({ schema: 'mindustry-waves-v1', groups }, null, 2)], { type: 'application/json' }), 'waves.json')} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.downloadWaveConfig')}</button>{importError ? <p role="alert" className="text-sm text-red-600">{importError}</p> : null}<button type="button" disabled={disabled || !history.canUndo} onClick={history.undo} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.undo')}</button><button type="button" disabled={disabled || !history.canRedo} onClick={history.redo} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.redo')}</button><select aria-label={t('editor.waveTemplate')} value={template} onChange={event => setTemplate(event.target.value)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm">{WAVE_TEMPLATE_KEYS.map(({ id, labelKey }) => <option key={id} value={id}>{t(labelKey)}</option>)}</select><button type="button" disabled={disabled} onClick={applyTemplate} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.applyTemplate')}</button></div>
    <WaveTimeline groups={groups} disabled={disabled} name={contentName} onUpdate={update} onLocate={index => { setShownCount(count => Math.max(count,index+1)); setTimeout(() => groupRefs.current.get(index)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),0); }} />
    <section className="space-y-2 border border-[var(--border)] p-3"><h5 className="text-sm font-semibold">{t('editor.previewWaves')}</h5><div className="flex flex-wrap gap-2"><select aria-label={t('editor.previewWaveCount')} value={previewCount} onChange={event => setPreviewCount(Number(event.target.value))} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm"><option value={10}>{t('editor.previewFirst10')}</option><option value={20}>{t('editor.previewFirst20')}</option><option value={1}>{t('editor.previewSpecific')}</option></select>{previewCount === 1 ? <input aria-label={t('editor.previewSpecific')} type="number" min={1} value={previewWave} onChange={event => setPreviewWave(Math.max(1, Number(event.target.value) || 1))} className="min-h-11 w-28 border border-[var(--border)] bg-[var(--bg-card)] px-2" /> : null}<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={bossOnly} onChange={event => setBossOnly(event.target.checked)} />{t('editor.bossOnly')}</label></div><ol className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">{Array.from({ length: previewCount }, (_, i) => previewCount === 1 ? previewWave : i + 1).map(wave => <li key={wave} className="border border-[var(--border)] p-2 text-sm"><strong>{t('editor.waveNumber', { wave })}</strong>{groups.filter(group => !bossOnly || group.effect === 'boss').map((group, index) => { const count = spawnedAt(group, wave); return count ? <p key={index}>{contentName(group.type)} × {count}</p> : null; })}</li>)}</ol><p className="text-xs text-[var(--text-muted)]">{t('editor.previewNote')}</p></section>
    {selected.size ? <div className="flex flex-wrap items-center gap-2 border border-[var(--border)] p-3"><span className="text-sm">{t('editor.selectedGroups', { count: selected.size })}</span><select aria-label={t('editor.batchField')} value={batchKey} onChange={event => setBatchKey(event.target.value)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-2">{NUMERIC_FIELDS.filter(([key]) => !['amount', 'max'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="effect">{t('editor.fieldEffect')}</option></select><input aria-label={t('editor.batchValue')} value={batchValue} onChange={event => setBatchValue(event.target.value)} className="min-h-11 w-28 border border-[var(--border)] bg-[var(--bg-card)] px-2" /><button type="button" disabled={disabled} onClick={batchEdit} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.applyToSelectedGroups')}</button></div> : null}
    {validation.batch ? <ErrorText>{validation.batch}</ErrorText> : null}
    {!groups.length ? <div className="border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--text-muted)]">{t('editor.noWaveGroups')}</div> : null}

    <div className="space-y-3">{groups.slice(0, shownCount).map((group, index) => {
      const showAdvanced = Boolean(advanced[index]);
      return <fieldset ref={element => { if (element) groupRefs.current.set(index, element); else groupRefs.current.delete(index); }} key={index} className="border border-[var(--border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[var(--text-muted)]"><label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={t('editor.selectWaveGroup', { index: index + 1 })} checked={selected.has(index)} onChange={event => setSelected(current => { const next = new Set(current); event.target.checked ? next.add(index) : next.delete(index); return next; })} />#{index + 1}</label></legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('editor.fieldUnit')}><ContentPicker type="unit" value={typeof group.type === 'string' ? group.type : ''} disabled={disabled} onChange={name => update(index, { type: name })} label={t('editor.chooseUnit')} /></Field>
          {NUMERIC_FIELDS.slice(0, 7).map(([key, label, min]) => <Field key={key} label={label}><input type="number" min={min} step={key === 'scaling' || key === 'shields' || key === 'shieldScaling' ? 'any' : 1} placeholder={key === 'end' ? t('editor.noLimit') : key === 'scaling' ? t('editor.noGrowth') : undefined} value={(key === 'end' || key === 'scaling') && numberValue(group[key], 2147483647) === 2147483647 ? '' : numberValue(group[key], key === 'spacing' || key === 'amount' ? 1 : key === 'max' ? 40 : 0) + (key === 'begin' || key === 'end' ? 1 : 0)} disabled={disabled} onChange={(event) => { if (!event.target.value && (key === 'end' || key === 'scaling')) update(index, { [key]: 2147483647 }); else updateNumber(index, key, event.target.value, min); }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>)}
        </div>

        <button type="button" onClick={() => setAdvanced((current) => ({ ...current, [index]: !showAdvanced }))} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--primary)]">{showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{showAdvanced ? t('editor.hideAdvanced') : t('editor.showAdvanced')}</button>

        {showAdvanced ? <div className="mt-2 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {NUMERIC_FIELDS.slice(7).map(([key, label, min]) => <Field key={key} label={label}><input type="number" min={min} value={numberValue(group[key], key === 'spawn' ? -1 : 0)} disabled={disabled} onChange={(event) => { if (!event.target.value && (key === 'end' || key === 'scaling')) update(index, { [key]: 2147483647 }); else updateNumber(index, key, event.target.value, min); }} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>)}
          <Field label={t('editor.fieldStatusEffect')}><ContentPicker type="status" value={typeof group.effect === 'string' ? group.effect : 'none'} disabled={disabled} onChange={name => update(index, { effect: name })} label={t('editor.chooseStatusEffect')} /></Field>
          <div className="space-y-2 sm:col-span-2"><h5 className="text-xs text-[var(--text-muted)]">{t('editor.payloads')}</h5>{payloadRows(group.payloads).map((row, rowIndex) => <div key={rowIndex} className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] gap-2"><ContentPicker type="unit" value={row.type} disabled={disabled} label={t('editor.choosePayloadUnit')} onChange={name => { const rows = payloadRows(group.payloads); rows[rowIndex].type = name; update(index, { payloads: payloadValues(rows) }); }} /><input aria-label={t('editor.payloadCount', { index: rowIndex + 1 })} type="number" min={0} max={100} value={row.amount} disabled={disabled} onChange={event => { const rows = payloadRows(group.payloads); rows[rowIndex].amount = Number(event.target.value); update(index, { payloads: payloadValues(rows) }); }} className="min-h-11 w-full self-start border border-[var(--border)] bg-[var(--bg-card)] px-2" /><button type="button" disabled={disabled} onClick={() => update(index, { payloads: payloadValues(payloadRows(group.payloads).filter((_, i) => i !== rowIndex)) })} className="min-h-11 self-start border border-[var(--border)]">{t('editor.remove')}</button></div>)}<button type="button" disabled={disabled} onClick={() => update(index, { payloads: [...(Array.isArray(group.payloads) ? group.payloads : []), 'dagger'].slice(0, 100) })} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.addPayloadUnit')}</button><p className="text-xs text-[var(--text-muted)]">{t('editor.payloadNote')}</p></div>
          <div className="space-y-2 sm:col-span-2"><h5 className="text-xs text-[var(--text-muted)]">{t('editor.carriedItems')}</h5><ContentPicker type="item" value={String((group.items as { item?: string } | undefined)?.item || 'copper')} disabled={disabled} onChange={name => update(index, { items: { item: name, amount: Number((group.items as { amount?: number } | undefined)?.amount || 0) } })} label={t('editor.chooseCarriedItem')} /><input aria-label={t('editor.carriedItemCount')} type="number" min={0} max={1000000} value={Number((group.items as { amount?: number } | undefined)?.amount || 0)} disabled={disabled} onChange={event => update(index, { items: { item: String((group.items as { item?: string } | undefined)?.item || 'copper'), amount: Number(event.target.value) } })} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3" /></div>
          <details className="sm:col-span-2"><summary className="min-h-11 cursor-pointer text-xs text-[var(--text-muted)]">{t('editor.rawData')}</summary><Field label={t('editor.payloadJson')}><textarea key={JSON.stringify(group.payloads)} defaultValue={JSON.stringify(Array.isArray(group.payloads) ? group.payloads : [])} disabled={disabled} onBlur={event => changeJsonField(index, 'payloads', event.target.value)} className="min-h-24 w-full border border-[var(--border)] bg-[var(--bg-card)] p-3 font-mono text-sm" />{validation[`${index}:payloads`] ? <ErrorText>{validation[`${index}:payloads`]}</ErrorText> : null}</Field></details>
        </div> : null}

        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" disabled={disabled || index === 0} onClick={() => move(index, index - 1)} className="flex min-h-11 min-w-11 items-center justify-center border border-[var(--border)] px-3 text-sm"><ChevronUp className="h-4 w-4" /><span className="sr-only">{t('editor.moveUp')}</span></button>
          <button type="button" disabled={disabled || index === groups.length - 1} onClick={() => move(index, index + 1)} className="flex min-h-11 min-w-11 items-center justify-center border border-[var(--border)] px-3 text-sm"><ChevronDown className="h-4 w-4" /><span className="sr-only">{t('editor.moveDown')}</span></button>
          <button type="button" disabled={disabled} onClick={() => add(group)} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><Copy className="h-4 w-4" />{t('editor.duplicate')}</button>
          <button type="button" disabled={disabled} onClick={() => remove(index)} className="inline-flex min-h-11 items-center gap-2 border border-red-500/40 px-3 text-sm text-red-700 dark:text-red-300"><Trash2 className="h-4 w-4" />{t('editor.remove')}</button>
        </div>
      </fieldset>;
    })}</div>
    {groups.length > shownCount ? <button type="button" onClick={() => setShownCount(value => value + 40)} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.loadMoreGroups')}</button> : null}
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
