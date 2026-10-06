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
} from '@/lib/api/v1/resources';
import { useI18n } from '@/i18n/provider';
import WaveEditor from './wave-editor';

type TerrainCell = { x: number; y: number; floor: string; overlay: string };
type MapObject = { x: number; y: number; name?: string; team?: string };
type WaveGroup = Record<string, unknown>;
type EditorData = {
  width: number;
  height: number;
  rules: Record<string, unknown>;
  terrain: TerrainCell[];
  buildings: MapObject[];
  enemySpawns: MapObject[];
  cores: MapObject[];
  truncated: boolean;
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
    return [{ x: row.x as number, y: row.y as number, name: typeof row.name === 'string' ? row.name : undefined, team: typeof row.team === 'string' ? row.team : undefined }];
  });
}

function readEditorData(summary: Record<string, unknown> | null): EditorData | null {
  const width = summary?.width;
  const height = summary?.height;
  const layers = record(summary?.tile_layers);
  const rawTerrain = layers?.terrain;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0
    || (width as number) * (height as number) > 40_000 || !Array.isArray(rawTerrain)) return null;
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
    truncated: summary?.tile_layers_truncated === true,
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

export default function MapLightEditor({ workbench, version, canEdit, onSaved }: {
  workbench: ResourceWorkbenchV2Response;
  version: ResourceWorkbenchV2Version | null;
  canEdit: boolean;
  onSaved?: (versionPublicId: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<EditorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [terrainEdits, setTerrainEdits] = useState<TerrainSnapshot>({});
  const [terrainUndo, setTerrainUndo] = useState<TerrainSnapshot[]>([]);
  const [ruleEdits, setRuleEdits] = useState<Record<string, unknown>>({});
  const [waveGroups, setWaveGroups] = useState<WaveGroup[]>([]);
  const [waveOperations, setWaveOperations] = useState<NonNullable<ResourceV2MapTransformInput['wave_operations']>>([]);
  const [floorChoice, setFloorChoice] = useState('');
  const [overlayChoice, setOverlayChoice] = useState('air');
  const [brushSize, setBrushSize] = useState<1 | 3 | 5>(1);
  const [painting, setPainting] = useState(false);
  const [tab, setTab] = useState<'terrain' | 'rules' | 'waves' | 'objects'>('terrain');
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const saveAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const versionId = version?.public_id;

  useEffect(() => {
    setEditor(null); setTerrainEdits({}); setTerrainUndo([]); setRuleEdits({}); setWaveOperations([]); setWaveGroups([]);
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
        setWaveGroups(Array.isArray(data.rules.spawns) ? data.rules.spawns.flatMap((value): WaveGroup[] => record(value) ? [record(value)!] : []) : []);
      })
      .catch((caught) => { if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.mapEditor.loadFailed')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [t, versionId, workbench.resource.public_id]);

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
  const canSave = Boolean(canEdit && version?.status === 'published' && editor && !loading && !busy
    && (Object.keys(ruleEdits).length > 0 || waveOperations.length > 0 || (completeTerrain && Object.keys(terrainEdits).length > 0)));

  const paintCell = (x: number, y: number, remember = false) => {
    if (!editor || !completeTerrain || !floorChoice) return;
    if (remember) setTerrainUndo((current) => [...current.slice(-29), { ...terrainEdits }]);
    const radius = Math.floor(brushSize / 2);
    setTerrainEdits((current) => {
      const next = { ...current };
      for (let dx = -radius; dx <= radius; dx += 1) for (let dy = -radius; dy <= radius; dy += 1) {
        const tx = x + dx; const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= editor.width || ty >= editor.height) continue;
        const base = terrainIndex.get(`${tx}:${ty}`);
        if (base) next[`${tx}:${ty}`] = { ...base, floor: floorChoice, overlay: overlayChoice };
      }
      return next;
    });
    setSaved(false); setError('');
  };

  const undoTerrain = () => {
    const previous = terrainUndo[terrainUndo.length - 1];
    if (!previous) return;
    setTerrainEdits(previous); setTerrainUndo((current) => current.slice(0, -1)); setSaved(false);
  };

  const changeRule = (key: string, value: unknown) => { setRuleEdits((current) => ({ ...current, [key]: value })); setSaved(false); setError(''); };
  const ruleValue = (key: string) => Object.prototype.hasOwnProperty.call(ruleEdits, key) ? ruleEdits[key] : editor?.rules[key];

  const saveNewVersion = async () => {
    if (!version || !editor || !canSave) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const operations: ResourceV2MapTransformInput = { terrain_changes: Object.values(terrainEdits), rule_changes: ruleEdits, wave_operations: waveOperations };
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

  return <div className="space-y-4">
    <p className="text-sm leading-6 text-[var(--text-secondary)]">完整工作区会将所有修改导出为新的 .msav 并创建新 revision，原版本保持不可变。</p>
    {loading ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.mapEditor.loading')}</p> : null}
    {loadError ? <p role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{loadError}</p> : null}
    {editor ? <>
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="地图编辑器工具页">
        {([['terrain', '地形'], ['rules', '规则'], ['waves', '波次'], ['objects', '地图对象']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={`min-h-11 shrink-0 border px-4 text-sm ${tab === key ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>{label}</button>)}
      </nav>

      {tab === 'terrain' ? <section className="space-y-3 border border-[var(--border)] p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('resourceWorkbenchV2.mapEditor.floor')}><select value={floorChoice} onChange={(event) => setFloorChoice(event.target.value)} disabled={busy} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm">{floors.map((floor) => <option key={floor}>{floor}</option>)}</select></Field>
          <Field label={t('resourceWorkbenchV2.mapEditor.overlay')}><select value={overlayChoice} onChange={(event) => setOverlayChoice(event.target.value)} disabled={busy} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm">{overlays.map((overlay) => <option key={overlay}>{overlay}</option>)}</select></Field>
          <Field label="画笔"><select value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value) as 1 | 3 | 5)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm"><option value={1}>1×1</option><option value={3}>3×3</option><option value={5}>5×5</option></select></Field>
          <button type="button" disabled={!terrainUndo.length || busy} onClick={undoTerrain} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><RotateCcw className="h-4 w-4" />撤销</button>
          <button type="button" disabled={!Object.keys(terrainEdits).length || busy} onClick={() => { setTerrainUndo((current) => [...current, { ...terrainEdits }]); setTerrainEdits({}); }} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm"><Eraser className="h-4 w-4" />清空改动</button>
        </div>
        {completeTerrain ? <>
          <div className="max-h-[70vh] overflow-auto border border-[var(--border)] bg-[#111820] p-2 overscroll-contain touch-none">
            <svg role="grid" aria-label={t('resourceWorkbenchV2.mapEditor.canvas')} width={Math.max(editor.width * 12, 320)} height={Math.max(editor.height * 12, 320)} viewBox={`0 0 ${editor.width} ${editor.height}`} onPointerLeave={() => setPainting(false)}>
              {editor.terrain.map((cell) => {
                const key = `${cell.x}:${cell.y}`; const current = terrainEdits[key] || cell;
                return <rect key={key} role="gridcell" aria-label={`${cell.x}, ${cell.y}: ${current.floor} / ${current.overlay}`} x={cell.x} y={cell.y} width="1" height="1"
                  fill={floorColor(current.floor)} stroke={current.overlay !== 'air' ? '#f4d35e' : '#17202a'} strokeWidth="0.08"
                  onPointerDown={(event) => { if (event.button !== 0) return; setPainting(true); paintCell(cell.x, cell.y, true); }}
                  onPointerEnter={() => { if (painting) paintCell(cell.x, cell.y); }} />;
              })}
              {editor.enemySpawns.map((item, index) => <circle key={`spawn:${item.x}:${item.y}:${index}`} cx={item.x + 0.5} cy={item.y + 0.5} r="0.32" fill="#ff6b6b" pointerEvents="none" />)}
              {editor.cores.map((item, index) => <rect key={`core:${item.x}:${item.y}:${index}`} x={item.x + 0.18} y={item.y + 0.18} width="0.64" height="0.64" fill="#7dd3fc" pointerEvents="none" />)}
            </svg>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{editor.width}×{editor.height} · 已改 {Object.keys(terrainEdits).length} 格。鼠标可拖动连续绘制，触屏可直接涂画。</p>
        </> : <p className="text-sm text-amber-700 dark:text-amber-200">地图地形数据被解析器截断，为避免破坏地图，本版本只开放规则和波次编辑。</p>}
      </section> : null}

      {tab === 'rules' ? <section className="space-y-5 border border-[var(--border)] p-3 sm:p-4">
        <div><h4 className="text-sm font-semibold text-[var(--text)]">游戏规则</h4><p className="mt-1 text-xs text-[var(--text-muted)]">直接对应 Mindustry Rules，导出时由官方读取器再次校验。</p></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{BOOLEAN_RULES.slice(0, showAdvancedRules ? BOOLEAN_RULES.length : 8).map((key) => {
          const original = ruleValue(key); if (typeof original !== 'boolean') return null;
          return <label key={key} className="flex min-h-11 items-center gap-3 border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)]"><input type="checkbox" className="h-5 w-5" disabled={busy} checked={original} onChange={(event) => changeRule(key, event.target.checked)} /><span className="break-all">{key}</span></label>;
        })}</div>
        <button type="button" onClick={() => setShowAdvancedRules((value) => !value)} className="min-h-11 text-sm text-[var(--primary)]">{showAdvancedRules ? '收起高级规则' : '展开全部规则'}</button>
        {showAdvancedRules ? <div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGER_RULES.map((key) => typeof ruleValue(key) === 'number' ? <Field key={key} label={key}><input type="number" min={0} value={Number(ruleValue(key))} onChange={(event) => changeRule(key, Number(event.target.value))} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field> : null)}
          {NUMBER_RULES.map((key) => typeof ruleValue(key) === 'number' ? <Field key={key} label={key}><input type="number" step="any" value={Number(ruleValue(key))} onChange={(event) => changeRule(key, Number(event.target.value))} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field> : null)}
          <Field label="modeName"><input value={typeof ruleValue('modeName') === 'string' ? String(ruleValue('modeName')) : ''} maxLength={100} onChange={(event) => changeRule('modeName', event.target.value)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-base sm:text-sm" /></Field>
          <Field label="bannedBlocks"><textarea defaultValue={Array.isArray(ruleValue('bannedBlocks')) ? (ruleValue('bannedBlocks') as unknown[]).join(', ') : ''} onBlur={(event) => changeRule('bannedBlocks', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} className="min-h-24 w-full border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm" /></Field>
          <Field label="bannedUnits"><textarea defaultValue={Array.isArray(ruleValue('bannedUnits')) ? (ruleValue('bannedUnits') as unknown[]).join(', ') : ''} onBlur={(event) => changeRule('bannedUnits', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} className="min-h-24 w-full border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm" /></Field>
        </div> : null}
      </section> : null}

      {tab === 'waves' ? <WaveEditor groups={waveGroups} disabled={busy} onGroupsChange={(groups) => { setWaveGroups(groups); setSaved(false); }} onOperation={(operation) => { setWaveOperations((current) => [...current, operation]); setSaved(false); setError(''); }} /> : null}

      {tab === 'objects' ? <section className="space-y-4 border border-[var(--border)] p-3 sm:p-4">
        <div><h4 className="text-sm font-semibold text-[var(--text)]">地图对象</h4><p className="mt-1 text-xs text-[var(--text-muted)]">检查核心、出生点与建筑布局，坐标与队伍信息来自当前版本实际地图数据。</p></div>
        <ObjectTable title="核心" items={editor.cores} /><ObjectTable title="敌人出生点" items={editor.enemySpawns} /><ObjectTable title="建筑" items={editor.buildings} />
      </section> : null}

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 border border-[var(--border)] bg-[var(--bg-card)]/95 p-3 shadow-lg backdrop-blur">
        <button type="button" disabled={!canSave} onClick={() => void saveNewVersion()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><Save className="h-4 w-4" />{busy ? t('resourceWorkbenchV2.mapEditor.saving') : '保存为新版本'}</button>
        <span className="text-xs text-[var(--text-muted)]">地形 {Object.keys(terrainEdits).length} · 规则 {Object.keys(ruleEdits).length} · 波次操作 {waveOperations.length}</span>
        {saved ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{t('resourceWorkbenchV2.mapEditor.saved')}</span> : null}
      </div>
      {error ? <p role="alert" className="border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    </> : null}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-[8rem] flex-1 space-y-1 text-xs text-[var(--text-muted)]"><span className="block">{label}</span>{children}</label>;
}

function ObjectTable({ title, items }: { title: string; items: MapObject[] }) {
  return <details open={title !== '建筑'} className="border border-[var(--border)]"><summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium">{title} · {items.length}</summary><div className="max-h-72 overflow-auto border-t border-[var(--border)]"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[var(--bg-card)]"><tr><th className="px-3 py-2">坐标</th><th className="px-3 py-2">内容</th><th className="px-3 py-2">队伍</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.x}:${item.y}:${index}`} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-mono">{item.x}, {item.y}</td><td className="px-3 py-2">{item.name || '—'}</td><td className="px-3 py-2">{item.team || '—'}</td></tr>)}</tbody></table>{!items.length ? <div className="p-4 text-center text-[var(--text-muted)]">暂无数据</div> : null}</div></details>;
}
