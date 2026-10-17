'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SchematicLightEditor from '@/components/forum/resources/workbench/schematic-light-editor';
import MapLightEditor from '@/components/forum/resources/workbench/map-light-editor';
import WaveEditor from '@/components/forum/resources/workbench/wave-editor';
import { useEditorHistory } from '@/components/forum/resources/workbench/editor-history';
import { publishEditorCopy } from '@/components/forum/resources/workbench/publish-editor-copy';
import { downloadEditorFile, type EditorSource } from '@/components/forum/resources/workbench/editor-source';
import { editorToolRequest, type EditorToolAnalysis } from '@/lib/api/editor-tools';
import { getResourceWorkbenchV2, type ResourceWorkbenchV2Response, type ResourceWorkbenchV2Version, type ResourceV2MapTransformInput } from '@/lib/api/v1/resources';
import { useI18n } from '@/i18n/provider';

export default function EditorToolWorkspace({ id, resourceId = '', versionId = '' }: { id: 'blueprint-editor' | 'map-editor' | 'wave-editor'; resourceId?: string; versionId?: string }) {
  const { t } = useI18n();
  const kind = id === 'blueprint-editor' ? 'schematic' : 'map';
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<EditorToolAnalysis | null>(null);
  const [workbench, setWorkbench] = useState<ResourceWorkbenchV2Response | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState(versionId);
  const [resourceInput, setResourceInput] = useState(resourceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waves, setWaves] = useState<Record<string, unknown>[]>([]);
  const [waveOperations, setWaveOperations] = useState<NonNullable<ResourceV2MapTransformInput['wave_operations']>>([]);
  const [blankWaves, setBlankWaves] = useState(id === 'wave-editor' && !resourceId);
  const [saved, setSaved] = useState('');
  const uploadSequence = useRef(0);
  const publishAttempt = useRef<{ hash: string; key: string } | null>(null);
  const history = useEditorHistory({ waves, waveOperations }, value => { setWaves(value.waves); setWaveOperations(value.waveOperations); });

  useEffect(() => {
    if (!resourceId) return;
    const controller = new AbortController(); setBusy(true); setError('');
    void getResourceWorkbenchV2(resourceId, { signal: controller.signal }, versionId || undefined).then(value => {
      if (controller.signal.aborted) return;
      if (value.resource.resource_kind !== kind) throw new Error('请选择对应类型的资源');
      setWorkbench(value); setSelectedVersionId(versionId || value.versions.find(version => version.recommended && version.status === 'published')?.public_id || value.versions.find(version => version.status === 'published')?.public_id || '');
    }).catch(caught => { if (!controller.signal.aborted) setError(caught.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [kind, resourceId, versionId]);

  const upload = async (selected: File | null) => {
    if (!selected) return; const sequence = ++uploadSequence.current;
    if (!selected.name.toLowerCase().endsWith(kind === 'schematic' ? '.msch' : '.msav') || selected.size > 20 * 1024 * 1024) { setError('请选择 20 MB 以内的正确游戏文件'); return; }
    setBusy(true); setError(''); setSaved('');
    try { const result = await editorToolRequest<EditorToolAnalysis>(kind, 'analyze', selected); if (sequence !== uploadSequence.current) return;
      setFile(selected); setAnalysis(result); setWorkbench(null); setBlankWaves(false); publishAttempt.current = null;
    } catch (caught) { if (sequence === uploadSequence.current) setError(caught instanceof Error ? caught.message : '解析失败'); }
    finally { if (sequence === uploadSequence.current) setBusy(false); }
  };
  const source = useMemo<EditorSource | undefined>(() => file && analysis ? {
    metadata: analysis.metadata, blocks: analysis.blocks,
    loadRegion: (x, y) => editorToolRequest(kind, 'region', file, undefined, { x, y }),
    exportFile: operations => editorToolRequest<Blob>(kind, 'export', file, operations),
    publishFile: async (exported, title) => {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await exported.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('') + title;
      if (publishAttempt.current?.hash !== hash) publishAttempt.current = { hash, key: crypto.randomUUID() };
      const draft = await publishEditorCopy(exported, kind, title || exported.name, undefined, publishAttempt.current.key);
      setSaved(`已提交审核：${draft.resource_public_id}`);
    },
  } : undefined, [analysis, file, kind]);
  const localVersion: ResourceWorkbenchV2Version | null = file ? { public_id: file.name, version: '1.0.0', display_version: '本地文件', version_mode: 'semver', revision: 1, release_channel: 'release', recommended: true, game_version_min: null, game_version_max: null, status: 'published', published_at: null, compatibility: [], dependencies: [], files: [{ public_id: 'local', role: 'primary', original_filename: file.name, display_name: file.name, size_bytes: file.size, delivery_mode: 'managed', integrity_status: 'verified', availability_status: 'available', downloadable: false, download_url: '', platform: null, architecture: null, package_type: null, mime_type: file.type, sha256: null, installable: false }] } : null;
  const version = workbench?.versions.find(item => item.public_id === selectedVersionId) || localVersion;
  const context = workbench || { resource: { public_id: 'local', title: file?.name.replace(/\.(msch|msav)$/i, '') || '本地文件' } };
  const canManage = Boolean(workbench?.permissions.can_manage && ['owner', 'maintainer'].includes(workbench.permissions.role || ''));
  const openResource = () => {
    const input = resourceInput.trim(); let publicId = input;
    try { if (/^https?:\/\//.test(input)) publicId = new URL(input).pathname.split('/').find((part, index, parts) => parts[index - 1] === 'resources') || ''; } catch { publicId = ''; }
    if (!/^[0-9a-f-]{36}$/i.test(publicId)) { setError('请输入资源链接或资源编号'); return; }
    window.location.assign(`/tools/${id}?resource=${encodeURIComponent(publicId)}`);
  };
  return <main className="mx-auto w-full min-w-0 max-w-6xl px-3 py-5 sm:px-6">
    <nav className="mb-3 text-sm text-[var(--text-muted)]"><Link href="/tools">{t('tools.title')}</Link> / {t(id === 'blueprint-editor' ? 'tools.blueprintEditor' : id === 'map-editor' ? 'tools.mapEditor' : 'tools.waveEditor')}</nav>
    <h1 className="mb-2 text-xl font-semibold">{t(id === 'blueprint-editor' ? 'tools.blueprintEditor' : id === 'map-editor' ? 'tools.mapEditor' : 'tools.waveEditor')}</h1>
    <p className="mb-4 text-sm text-[var(--text-secondary)]">打开文件 → 在线修改 → 下载游戏文件。所有人都能编辑公开资源副本；登录后可以发布自己的作品。</p>
    <section className="mb-4 flex flex-wrap items-center gap-3 border border-[var(--border)] p-3">
      <label className="flex min-h-11 cursor-pointer items-center border border-[var(--primary)] px-3 text-sm text-[var(--primary-text)]">上传本地 {kind === 'schematic' ? '.msch' : '.msav'}<input aria-label="上传编辑文件" type="file" accept={kind === 'schematic' ? '.msch' : '.msav'} disabled={busy} onChange={event => void upload(event.target.files?.[0] || null)} className="sr-only" /></label>
      <input aria-label="资源链接或编号" value={resourceInput} onChange={event => setResourceInput(event.target.value)} placeholder="粘贴资源链接或编号" className="min-h-11 min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm" /><button type="button" onClick={openResource} className="min-h-11 border border-[var(--border)] px-3 text-sm">打开资源</button><Link href={`/resources?resource_kind=${kind}`} className="min-h-11 px-2 py-3 text-sm text-[var(--primary-text)]">去资源中心选择</Link>
      {id === 'wave-editor' ? <button type="button" onClick={() => { setBlankWaves(true); setWorkbench(null); setFile(null); setAnalysis(null); setWaves([]); setWaveOperations([]); history.reset(); }} className="min-h-11 border border-[var(--border)] px-3 text-sm">新建波次配置</button> : null}
    </section>
    {busy ? <p role="status" className="mb-4 text-sm">正在读取文件与游戏资料…</p> : null}{error ? <p role="alert" className="mb-4 border border-red-500/30 p-3 text-sm text-red-700">{error}</p> : null}{saved ? <p role="status" className="mb-4 text-sm text-emerald-700">{saved} <Link href={`/resources/${saved.split('：')[1]}/workbench`} className="underline">查看提交</Link></p> : null}
    {workbench ? <div className="mb-4 flex flex-wrap gap-3"><strong>{workbench.resource.title}</strong><select aria-label="编辑版本" value={selectedVersionId} onChange={event => setSelectedVersionId(event.target.value)} className="min-h-11 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm">{workbench.versions.filter(item => item.status === 'published').map(item => <option key={item.public_id} value={item.public_id}>{item.display_version || item.version} · 修订 {item.revision}</option>)}</select><Link href={`/resources/${workbench.resource.public_id}`} className="min-h-11 py-3 text-sm text-[var(--primary-text)]">返回资源详情</Link></div> : null}
    {version && id === 'blueprint-editor' ? <SchematicLightEditor key={version.public_id} workbench={context} version={version} canEdit canManage={canManage} source={source} /> : version ? <MapLightEditor key={version.public_id} workbench={context} version={version} canEdit canManage={canManage} source={source} initialTab={id === 'wave-editor' ? 'waves' : 'terrain'} /> : null}
    {blankWaves && !busy ? <><WaveEditor groups={waves} operations={waveOperations} history={history} onGroupsChange={groups => { history.remember(); setWaves(groups); }} onOperation={operation => setWaveOperations(current => [...current, operation])} onOperationsReplace={setWaveOperations} /><div className="mt-3 flex flex-wrap gap-2 border border-[var(--border)] p-3"><button type="button" onClick={() => downloadEditorFile(new Blob([JSON.stringify({ schema: 'mindustry-waves-v1', groups: waves }, null, 2)], { type: 'application/json' }), 'waves.json')} className="min-h-11 border border-[var(--border)] px-3 text-sm">下载波次配置</button><p className="self-center text-sm text-[var(--text-muted)]">波次配置不能独立生成 .msav。选择地图后可把配置导入地图的波次页并导出。</p></div></> : null}
    {!version && !blankWaves && !busy ? <p className="border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">选择本地文件，或从公开资源开始。无需先发布资源。</p> : null}
  </main>;
}
