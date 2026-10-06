'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import {
  createResourceDirectVersionDraft,
  exportResourceWorkbenchMapV2,
  getResourceWorkbenchV2KindTabData,
  uploadResourceDirectDraft,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
  type ResourceV2MapTransformInput,
} from '@/lib/api/v1/resources';
import { useI18n } from '@/i18n/provider';

type TerrainCell = { x: number; y: number; floor: string; overlay: string };
type WaveGroup = Record<string, unknown>;
type EditorData = { width: number; height: number; rules: Record<string, unknown>; terrain: TerrainCell[]; truncated: boolean };

const RULE_TOGGLES = ['waves', 'waveTimer', 'waveSending', 'attackMode', 'pvp', 'infiniteResources', 'schematicsAllowed', 'logicUnitControl'] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readEditorData(summary: Record<string, unknown> | null): EditorData | null {
  const width = summary?.width;
  const height = summary?.height;
  const layers = record(summary?.tile_layers);
  const rawTerrain = layers?.terrain;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0
    || (width as number) * (height as number) > 5_000 || !Array.isArray(rawTerrain)) return null;
  const terrain = rawTerrain.flatMap((value): TerrainCell[] => {
    const cell = record(value);
    if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || typeof cell.name !== 'string'
      || (cell.x as number) < 0 || (cell.x as number) >= (width as number)
      || (cell.y as number) < 0 || (cell.y as number) >= (height as number)) return [];
    return [{ x: cell.x as number, y: cell.y as number, floor: cell.name, overlay: typeof cell.overlay === 'string' ? cell.overlay : 'air' }];
  });
  const rules = { ...(summary || {}) };
  delete rules.tile_layers; delete rules.tile_layers_truncated; delete rules.width; delete rules.height;
  return { width: width as number, height: height as number, rules, terrain, truncated: summary?.tile_layers_truncated === true };
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
  return '#7b7770';
}

export default function MapLightEditor({
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
  const [editor, setEditor] = useState<EditorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [terrainEdits, setTerrainEdits] = useState<Record<string, TerrainCell>>({});
  const [ruleEdits, setRuleEdits] = useState<Record<string, unknown>>({});
  const [waveGroups, setWaveGroups] = useState<WaveGroup[]>([]);
  const [waveOperations, setWaveOperations] = useState<NonNullable<ResourceV2MapTransformInput['wave_operations']>>([]);
  const [floorChoice, setFloorChoice] = useState('');
  const [overlayChoice, setOverlayChoice] = useState('air');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const saveAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const versionId = version?.public_id;

  useEffect(() => {
    setEditor(null); setTerrainEdits({}); setRuleEdits({}); setWaveOperations([]); setWaveGroups([]);
    setLoadError(''); setError(''); setSaved(false); saveAttempt.current = null;
    if (!versionId) return;
    const controller = new AbortController();
    setLoading(true);
    void getResourceWorkbenchV2KindTabData(workbench.resource.public_id, 'map', 'rules', versionId, undefined, { signal: controller.signal })
      .then((result) => {
        const data = readEditorData(result.summary);
        if (!data) throw new Error(t('resourceWorkbenchV2.mapEditor.unsupportedSize'));
        setEditor(data);
        setFloorChoice(data.terrain[0]?.floor || '');
        const groups = Array.isArray(data.rules.spawns) ? data.rules.spawns.flatMap((value): WaveGroup[] => record(value) ? [record(value)!] : []) : [];
        setWaveGroups(groups);
      })
      .catch((caught) => { if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.mapEditor.loadFailed')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [t, versionId, workbench.resource.public_id]);

  const floors = useMemo(() => [...new Set((editor?.terrain || []).map((cell) => cell.floor))].sort(), [editor]);
  const overlays = useMemo(() => ['air', ...new Set((editor?.terrain || []).map((cell) => cell.overlay).filter((name) => name !== 'air'))].sort((a, b) => a === 'air' ? -1 : b === 'air' ? 1 : a.localeCompare(b)), [editor]);
  const completeTerrain = Boolean(editor && !editor.truncated && editor.terrain.length === editor.width * editor.height);
  const canSave = Boolean(canEdit && version?.status === 'published' && editor && !loading && !busy
    && Object.keys(ruleEdits).length + waveOperations.length > 0
    || canEdit && version?.status === 'published' && editor && !loading && !busy && completeTerrain && Object.keys(terrainEdits).length > 0);

  const editTerrain = (cell: TerrainCell) => {
    if (!completeTerrain || !floorChoice) return;
    const key = `${cell.x}:${cell.y}`;
    const current = terrainEdits[key] || cell;
    const next = { ...current, floor: floorChoice, overlay: overlayChoice };
    setTerrainEdits((value) => ({ ...value, [key]: next }));
    setSaved(false); setError('');
  };

  const changeRule = (key: string, value: boolean) => {
    setRuleEdits((current) => ({ ...current, [key]: value }));
    setSaved(false); setError('');
  };

  const updateWave = (index: number, key: string, value: string | number) => {
    const field = key === 'type' ? value : Number(value);
    setWaveGroups((current) => current.map((group, itemIndex) => itemIndex === index ? { ...group, [key]: field } : group));
    setWaveOperations((current) => [...current, { action: 'update', index, fields: { [key]: field } }]);
    setSaved(false); setError('');
  };

  const moveWave = (index: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= waveGroups.length || toIndex === index) return;
    setWaveGroups((current) => { const next = [...current]; const [group] = next.splice(index, 1); next.splice(toIndex, 0, group); return next; });
    setWaveOperations((current) => [...current, { action: 'move', index, to_index: toIndex }]);
    setSaved(false); setError('');
  };

  const deleteWave = (index: number) => {
    setWaveGroups((current) => current.filter((_group, itemIndex) => itemIndex !== index));
    setWaveOperations((current) => [...current, { action: 'delete', index }]);
    setSaved(false); setError('');
  };

  const addWave = () => {
    if (waveGroups.length >= 1_000) return;
    const fields = { type: 'dagger', begin: 1, end: 1, spacing: 1, amount: 1 };
    const index = waveGroups.length;
    setWaveGroups((current) => [...current, fields]);
    setWaveOperations((current) => [...current, { action: 'add', index, fields }]);
    setSaved(false); setError('');
  };

  const saveNewVersion = async () => {
    if (!version || !editor || !canSave) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const operations: ResourceV2MapTransformInput = {
        terrain_changes: Object.values(terrainEdits),
        rule_changes: ruleEdits,
        wave_operations: waveOperations,
      };
      const fingerprint = JSON.stringify({ source: version.public_id, operations });
      if (!saveAttempt.current || saveAttempt.current.fingerprint !== fingerprint) {
        saveAttempt.current = { fingerprint, key: newIdempotencyKey() };
      }
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
      await uploadResourceDirectDraft(draft.version_public_id, file);
      await onSaved?.(draft.version_public_id);
      saveAttempt.current = null;
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.mapEditor.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.ownerOnly')}</p>;
  if (!version || version.status !== 'published') return <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.publishedOnly')}</p>;

  return <div className="space-y-4">
    <p className="text-sm leading-6 text-[var(--text-secondary)]">{t('resourceWorkbenchV2.mapEditor.help')}</p>
    {loading && <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.loading')}</p>}
    {loadError && <p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{loadError}</p>}
    {editor && <>
      <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.mapEditor.canvas')}</h4>
        {completeTerrain ? <>
          <div className="flex flex-wrap gap-3">
            <label className="flex min-h-10 items-center gap-2 text-sm">{t('resourceWorkbenchV2.mapEditor.floor')}
              <select value={floorChoice} onChange={(event) => setFloorChoice(event.target.value)} disabled={busy} className="min-h-10 rounded border border-[var(--border)] bg-[var(--bg-card)] px-2">{floors.map((floor) => <option key={floor}>{floor}</option>)}</select>
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm">{t('resourceWorkbenchV2.mapEditor.overlay')}
              <select value={overlayChoice} onChange={(event) => setOverlayChoice(event.target.value)} disabled={busy} className="min-h-10 rounded border border-[var(--border)] bg-[var(--bg-card)] px-2">{overlays.map((overlay) => <option key={overlay}>{overlay}</option>)}</select>
            </label>
          </div>
          <div className="max-h-[32rem] overflow-auto rounded border border-[var(--border)] bg-[#111820] p-2">
            <svg role="grid" aria-label={t('resourceWorkbenchV2.mapEditor.canvas')} width={editor.width * 10} height={editor.height * 10} viewBox={`0 0 ${editor.width} ${editor.height}`}>
              {editor.terrain.map((cell) => {
                const key = `${cell.x}:${cell.y}`;
                const current = terrainEdits[key] || cell;
                return <rect key={key} role="gridcell" aria-label={`${cell.x}, ${cell.y}: ${current.floor} / ${current.overlay}`} x={cell.x} y={cell.y} width="1" height="1"
                  fill={floorColor(current.floor)} stroke={current.overlay !== 'air' ? '#f4d35e' : '#17202a'} strokeWidth="0.08" onClick={() => editTerrain(cell)} />;
              })}
            </svg>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.canvasHelp', { width: editor.width, height: editor.height, edits: Object.keys(terrainEdits).length })}</p>
        </> : <p className="text-sm text-amber-700 dark:text-amber-200">{t('resourceWorkbenchV2.mapEditor.terrainPartial')}</p>}
      </section>
      <section className="space-y-2 rounded-lg border border-[var(--border)] p-3">
        <h4 className="text-sm font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.mapEditor.rules')}</h4>
        <div className="grid gap-2 sm:grid-cols-2">{RULE_TOGGLES.map((key) => {
          const original = editor.rules[key];
          if (typeof original !== 'boolean') return null;
          return <label key={key} className="flex min-h-10 items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" disabled={busy} checked={typeof ruleEdits[key] === 'boolean' ? ruleEdits[key] as boolean : original} onChange={(event) => changeRule(key, event.target.checked)} />{t(`resourceWorkbenchV2.mapEditor.rule.${key}`)}</label>;
        })}</div>
      </section>
      <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
        <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.mapEditor.waves')}</h4><button type="button" disabled={busy || waveGroups.length >= 1_000} onClick={addWave} className="min-h-9 rounded border border-[var(--border)] px-3 text-sm">{t('resourceWorkbenchV2.mapEditor.addWave')}</button></div>
        {waveGroups.length === 0 && <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.noWaves')}</p>}
        {waveGroups.map((group, index) => <fieldset key={`${index}:${String(group.type ?? 'unknown')}`} className="grid gap-2 rounded border border-[var(--border)] p-3 sm:grid-cols-5">
          <label className="space-y-1 text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.unit')}<input value={typeof group.type === 'string' ? group.type : ''} disabled={busy} onChange={(event) => updateWave(index, 'type', event.target.value)} className="min-h-9 w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm text-[var(--text)]" /></label>
          {(['begin', 'end', 'spacing', 'amount'] as const).map((field) => <label key={field} className="space-y-1 text-xs text-[var(--text-muted)]">{t(`resourceWorkbenchV2.mapEditor.${field}`)}<input type="number" min={field === 'spacing' ? 1 : 0} value={typeof group[field] === 'number' ? group[field] as number : 0} disabled={busy} onChange={(event) => updateWave(index, field, event.target.value)} className="min-h-9 w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm text-[var(--text)]" /></label>)}
          <div className="flex items-end gap-1"><button type="button" disabled={busy || index === 0} onClick={() => moveWave(index, index - 1)} className="min-h-9 rounded border border-[var(--border)] px-2" aria-label={t('resourceWorkbenchV2.mapEditor.moveWaveUp')}>↑</button><button type="button" disabled={busy || index === waveGroups.length - 1} onClick={() => moveWave(index, index + 1)} className="min-h-9 rounded border border-[var(--border)] px-2" aria-label={t('resourceWorkbenchV2.mapEditor.moveWaveDown')}>↓</button><button type="button" disabled={busy} onClick={() => deleteWave(index)} className="min-h-9 rounded border border-red-500/40 px-2 text-red-700 dark:text-red-300">{t('resourceWorkbenchV2.mapEditor.deleteWave')}</button></div>
        </fieldset>)}
        <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.waveHelp')}</p>
      </section>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
        <button type="button" disabled={!canSave} onClick={() => void saveNewVersion()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-4 w-4" />{busy ? t('resourceWorkbenchV2.mapEditor.saving') : t('resourceWorkbenchV2.mapEditor.save')}</button>
        {saved && <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{t('resourceWorkbenchV2.mapEditor.saved')}</span>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </>}
  </div>;
}
