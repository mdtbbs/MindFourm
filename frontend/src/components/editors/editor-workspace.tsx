'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Download, FilePlus2, FolderOpen, LoaderCircle, Redo2, Save, Search, Undo2, Upload } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { SchematicEditor } from './schematic/schematic-editor';
import { MapEditor } from './map/map-editor';
import { analyzeEditorFile, createBlankEditorFile, exportEditorFile, getEditorContentCatalog, getEditorStatus, type EditorAnalysis, type EditorContentCatalog, type EditorKind, type EditorStatus } from '@/lib/editors/editor-api';
import { buildWaveOperations, createInitialMapDocument, createInitialSchematicDocument, isMapDocument, isSchematicDocument, mapObjectOperations, schematicOperations, type EditorDocument } from '@/lib/editors/editor-model';
import { createEditorHistory, pushEditorHistory, redoEditorHistory, undoEditorHistory, type EditorHistory } from '@/lib/editors/editor-history';
import { deleteEditorDraft, editorDraftId, getEditorDraft, hashEditorSource, saveEditorDraft, type StoredEditorDraft } from '@/lib/editors/editor-drafts';
import { getResourceWorkbenchV2, listResourcesV1, createResourceDirectUploadDraft, createResourceDirectVersionDraft, uploadResourceDirectDraft, type ResourceWorkbenchV2Response, type ResourceWorkbenchV2Version } from '@/lib/api/v1/resources';
import { V1ApiError } from '@/lib/api/v1/transport';
import { resourceApi } from '@/lib/api/client';
import type { Resource } from '@/types';
import { ContentPicker } from './shared/content-picker';

type PageKind = 'schematic' | 'map' | 'wave';
type SourceInfo = { resourceId?: string; versionId?: string; resourceTitle?: string; canManage: boolean };
type ResourceChoice = { public_id: string; title: string; resource_kind: string };

const LABELS: Record<PageKind, { title: string; extension: string; kind: EditorKind }> = {
  schematic: { title: '蓝图编辑器', extension: '.msch', kind: 'schematic' },
  map: { title: '地图编辑器', extension: '.msav', kind: 'map' },
  wave: { title: '波次编辑器', extension: '.msav', kind: 'map' },
};

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function suggestedVersion(version?: string): string {
  const match = version?.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : '1.0.0';
}
function messageFor(error: unknown): string {
  if (error instanceof V1ApiError) {
    const labels: Record<string, string> = {
      INVALID_MAP_OPERATION: '地图编辑内容无效，请检查地形选择。', INVALID_MAP_OBJECT_OPERATION: '对象位置无效，可能超出地图边界、与其他对象重叠，或包含暂不支持的连接配置。',
      UNSUPPORTED_MAP_CONTENT: '文件含有当前 Renderer 不支持的内容，无法安全导出。', INVALID_SCHEMATIC_CONFIG: '蓝图配置无法安全写入，原始配置已保留。',
      RESOURCE_NOT_FOUND: '没有找到这个资源或版本。', FORBIDDEN: '只有资源所有者或维护者可以保存新版本。',
    };
    return labels[error.code] || error.message || '请求失败，请稍后重试。';
  }
  return error instanceof Error ? error.message : '操作失败，请稍后重试。';
}
function cleanTitle(fileName: string) { return fileName.replace(/\.(msch|msav)$/i, '') || 'Mindustry 文件'; }
function base64Schematic(value: string): File {
  const text = value.trim().replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  const binary = atob(text);
  if (!binary.startsWith('msch')) throw new Error('蓝图字符串格式无效，应以 bXNja 开头。');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], '粘贴的蓝图.msch', { type: 'application/octet-stream' });
}
function downloadFile(file: Blob, name: string) {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export function EditorWorkspace({ pageKind }: { pageKind: PageKind }) {
  const { locale } = useI18n();
  const descriptor = LABELS[pageKind];
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [catalog, setCatalog] = useState<EditorContentCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceHash, setSourceHash] = useState('');
  const [analysis, setAnalysis] = useState<EditorAnalysis | null>(null);
  const [history, setHistory] = useState<EditorHistory<EditorDocument> | null>(null);
  const [baseDocument, setBaseDocument] = useState<EditorDocument | null>(null);
  const [title, setTitle] = useState('');
  const [sourceInfo, setSourceInfo] = useState<SourceInfo>({ canManage: false });
  const [recoverableDraft, setRecoverableDraft] = useState<StoredEditorDraft | null>(null);
  const [draftLookupPending, setDraftLookupPending] = useState(false);
  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceChoices, setResourceChoices] = useState<ResourceChoice[]>([]);
  const [resourceMode, setResourceMode] = useState<'center' | 'mine'>('center');
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedSchematic, setPastedSchematic] = useState('');
  const [newWidth, setNewWidth] = useState(pageKind === 'schematic' ? 20 : 80);
  const [newHeight, setNewHeight] = useState(pageKind === 'schematic' ? 20 : 60);
  const [newName, setNewName] = useState('新建文件');
  const [newFloor, setNewFloor] = useState('stone');
  const [newTemplate, setNewTemplate] = useState<'survival' | 'sandbox' | 'attack' | 'pvp' | 'custom'>('survival');
  const [saveDialog, setSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveVersion, setSaveVersion] = useState('1.0.0');
  const [saveChannel, setSaveChannel] = useState<'release' | 'beta' | 'alpha' | 'snapshot'>('release');
  const fileInput = useRef<HTMLInputElement>(null);
  const documentState = history?.present || null;
  const mapMode = pageKind !== 'schematic';
  const canEdit = status && (pageKind === 'schematic' ? status.schematic.enabled : pageKind === 'map' ? status.map.enabled : status.wave.enabled);

  useEffect(() => {
    let alive = true;
    getEditorStatus().then(async (nextStatus) => {
      if (!alive) return;
      setStatus(nextStatus);
      const capability = pageKind === 'schematic' ? nextStatus.schematic : pageKind === 'map' ? nextStatus.map : nextStatus.wave;
      if (!capability.enabled) return;
      const nextCatalog = await getEditorContentCatalog();
      if (alive) setCatalog(nextCatalog);
    }).catch((cause: unknown) => { if (alive) setError(messageFor(cause)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [pageKind]);

  const activate = useCallback(async (file: File, nextAnalysis?: EditorAnalysis, info: SourceInfo = { canManage: false }) => {
    setBusy(true); setError(''); setRecoverableDraft(null); setDraftLookupPending(true);
    try {
      const result = nextAnalysis || await analyzeEditorFile(descriptor.kind, file);
      const digest = await hashEditorSource(file);
      const initial = descriptor.kind === 'schematic'
        ? createInitialSchematicDocument(result, catalog?.blocks || [])
        : createInitialMapDocument(result);
      setSourceFile(file); setSourceHash(digest); setAnalysis(result); setBaseDocument(initial); setHistory(createEditorHistory(initial));
      setTitle(cleanTitle(info.resourceTitle || result.file_name || file.name)); setSourceInfo(info);
      const draft = await getEditorDraft(editorDraftId(descriptor.kind, digest));
      if (draft && draft.updated_at > Date.now() - 30 * 24 * 60 * 60 * 1000) setRecoverableDraft(draft);
      setShowPaste(false); setShowResourcePicker(false);
    } catch (cause) { setError(messageFor(cause)); }
    finally { setBusy(false); setDraftLookupPending(false); }
  }, [catalog?.blocks, descriptor.kind]);

  const loadResource = useCallback(async (resourceId: string, requestedVersion?: string) => {
    setBusy(true); setError('');
    try {
      const workbench: ResourceWorkbenchV2Response = await getResourceWorkbenchV2(resourceId);
      if (workbench.resource.resource_kind !== descriptor.kind) throw new Error(`这个资源不是${pageKind === 'schematic' ? '蓝图' : '地图'}。`);
      const requested = requestedVersion ? workbench.versions.find((item) => item.public_id === requestedVersion) : null;
      if (requestedVersion && !requested) throw new Error('链接指定的资源版本不存在或当前不可访问。');
      const version = requested
        || workbench.versions.find((item) => item.status === 'published' && item.files.some((file) => file.downloadable))
        || workbench.versions.find((item) => item.files.some((file) => file.downloadable));
      if (!version) throw new Error('这个资源目前没有可读取的文件版本。');
      const extension = descriptor.extension;
      const fileEntry = version.files.find((item) => item.downloadable && (item.original_filename || item.download_url).toLowerCase().includes(extension))
        || version.files.find((item) => item.downloadable);
      if (!fileEntry?.download_url) throw new Error('该版本没有可下载的地图或蓝图文件。');
      const response = await fetch(new URL(fileEntry.download_url, window.location.origin), { credentials: 'include' });
      if (!response.ok) throw new Error(`资源文件读取失败（HTTP ${response.status}）。`);
      const blob = await response.blob();
      const file = new File([blob], fileEntry.original_filename || `${workbench.resource.title}${extension}`, { type: 'application/octet-stream' });
      await activate(file, undefined, { resourceId, versionId: version.public_id, resourceTitle: workbench.resource.title, canManage: workbench.permissions.can_manage });
      const query = new URLSearchParams(window.location.search); query.set('resource', resourceId); query.set('version', version.public_id);
      window.history.replaceState(null, '', `${window.location.pathname}?${query.toString()}`);
    } catch (cause) { setError(messageFor(cause)); }
    finally { setBusy(false); }
  }, [activate, descriptor.extension, descriptor.kind, pageKind]);

  const urlLoaded = useRef(false);
  useEffect(() => {
    if (!status || urlLoaded.current || typeof window === 'undefined') return;
    const query = new URLSearchParams(window.location.search), resourceId = query.get('resource');
    if (!resourceId) { urlLoaded.current = true; return; }
    urlLoaded.current = true;
    void loadResource(resourceId, query.get('version') || undefined);
  }, [loadResource, status]);

  const acceptFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(descriptor.extension)) { setError(`请选择 ${descriptor.extension} 文件。`); return; }
    const query = new URLSearchParams(window.location.search); query.delete('resource'); query.delete('version');
    window.history.replaceState(null, '', `${window.location.pathname}${query.size ? `?${query}` : ''}`);
    void activate(file);
  };
  const createBlank = async () => {
    if (!Number.isInteger(newWidth) || !Number.isInteger(newHeight) || newWidth < 1 || newHeight < 1 || newWidth * newHeight > (pageKind === 'schematic' ? 16_384 : 2_000_000)) { setError('宽高必须是有效整数，且不能超过文件安全上限。'); return; }
    setBusy(true); setError('');
    try {
      const blob = await createBlankEditorFile(descriptor.kind, { width: newWidth, height: newHeight, name: newName.trim() || '新建文件', ...(mapMode ? { floor: newFloor, template: newTemplate } : {}) });
      const file = new File([blob], `${newName.trim() || '新建文件'}${descriptor.extension}`, { type: 'application/octet-stream' });
      await activate(file);
    } catch (cause) { setError(messageFor(cause)); setBusy(false); }
  };
  const loadSearchResults = async () => {
    setBusy(true); setError('');
    try {
      if (resourceMode === 'center') {
        const page = await listResourcesV1({ limit: 40, offset: 0, query: resourceQuery.trim() || undefined });
        setResourceChoices(page.items.filter((item) => item.resource_kind === descriptor.kind));
      } else {
        const page = await resourceApi.getMyResources({ limit: 100 });
        setResourceChoices((page.data as Resource[]).filter((item) => item.resource_kind === descriptor.kind && item.public_id).map((item) => ({ public_id: item.public_id || '', title: item.title, resource_kind: item.resource_kind || '' })));
      }
    } catch (cause) { setError(messageFor(cause)); }
    finally { setBusy(false); }
  };

  const changeDocument = (next: EditorDocument) => {
    if (isMapDocument(next) && isMapDocument(baseDocument)
      && buildWaveOperations(baseDocument.waves, next.waves).length > 1_000) {
      setError('波次差异超过导出上限 1,000 项，请分批编辑后导出。');
      return;
    }
    setError('');
    setHistory((current) => current ? pushEditorHistory(current, next) : current);
  };
  const undo = () => setHistory((current) => current ? undoEditorHistory(current) : current);
  const redo = () => setHistory((current) => current ? redoEditorHistory(current) : current);
  const operations = useMemo(() => {
    if (!analysis || !documentState || !baseDocument) return null;
    if (descriptor.kind === 'schematic' && isSchematicDocument(documentState)) return schematicOperations(documentState);
    if (!isMapDocument(documentState) || !isMapDocument(baseDocument)) return null;
    const current = documentState, base = baseDocument;
    return {
      terrain_changes: Object.values(current.terrain_edits),
      object_operations: mapObjectOperations(base.objects, current.objects),
      rule_changes: current.rule_changes,
      wave_operations: buildWaveOperations(base.waves, current.waves),
    };
  }, [analysis, baseDocument, descriptor.kind, documentState]);
  const dirty = Boolean(documentState && baseDocument && JSON.stringify(documentState) !== JSON.stringify(baseDocument));
  const exportCurrent = async () => {
    if (!sourceFile || !operations) return null;
    setBusy(true); setError('');
    try {
      const blob = await exportEditorFile(descriptor.kind, sourceFile, operations);
      return blob;
    } catch (cause) { setError(messageFor(cause)); return null; }
    finally { setBusy(false); }
  };
  const handleExport = async () => {
    const blob = await exportCurrent();
    if (blob) downloadFile(blob, `${title || 'Mindustry'}${descriptor.extension}`);
  };
  const saveLocalDraft = useCallback(async (quiet = false) => {
    if (!analysis || !sourceFile || !sourceHash || !documentState) return;
    try {
      await saveEditorDraft({ id: editorDraftId(descriptor.kind, sourceHash), kind: descriptor.kind, title, file_name: sourceFile.name,
        source: sourceFile, source_hash: sourceHash, resource_public_id: sourceInfo.resourceId, version_public_id: sourceInfo.versionId,
        operations: documentState, updated_at: Date.now() });
      if (!quiet) setError('本地草稿已保存，可以安全刷新页面。');
    } catch (cause) { if (!quiet) setError(messageFor(cause)); }
  }, [analysis, descriptor.kind, documentState, sourceFile, sourceHash, sourceInfo.resourceId, sourceInfo.versionId, title]);
  useEffect(() => {
    if (!analysis || !sourceFile || !documentState || !sourceHash || draftLookupPending || recoverableDraft) return;
    const timer = window.setTimeout(() => { void saveLocalDraft(true); }, 700);
    return () => window.clearTimeout(timer);
  }, [analysis, documentState, draftLookupPending, recoverableDraft, saveLocalDraft, sourceFile, sourceHash]);
  const restoreDraft = () => {
    if (!recoverableDraft || !analysis) return;
    setHistory(createEditorHistory(recoverableDraft.operations as EditorDocument)); setTitle(recoverableDraft.title); setRecoverableDraft(null);
  };
  const discardDraft = async () => { if (recoverableDraft) await deleteEditorDraft(recoverableDraft.id); setRecoverableDraft(null); };

  const saveToResource = async () => {
    if (!sourceFile) return;
    setBusy(true); setError('');
    try {
      const blob = await exportCurrent();
      if (!blob) return;
      const output = new File([blob], `${saveTitle || title}${descriptor.extension}`, { type: 'application/octet-stream' });
      if (sourceInfo.resourceId && sourceInfo.canManage) {
        const draft = await createResourceDirectVersionDraft(sourceInfo.resourceId, { version: saveVersion.trim(), release_channel: saveChannel }, crypto.randomUUID());
        if (draft.draft_status === 'open') await uploadResourceDirectDraft(draft.version_public_id, output);
        setSaveDialog(false); setError('资源新版本已上传，等待资源审核。');
      } else {
        const draft = await createResourceDirectUploadDraft({ title: saveTitle.trim() || title, resource_type: 'upload', resource_kind: descriptor.kind,
          content_language: locale, version: saveVersion.trim(), release_channel: saveChannel, is_public: 0 }, crypto.randomUUID());
        if (draft.draft_status === 'open') await uploadResourceDirectDraft(draft.version_public_id, output);
        if (draft.resource_id) window.location.assign(`/resources/${draft.resource_id}`);
        else { setSaveDialog(false); setError('新资源文件已上传，资源中心正在处理。'); }
      }
    } catch (cause) { setError(messageFor(cause)); }
    finally { setBusy(false); }
  };

  const importWaveJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !history || !isMapDocument(history.present)) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const groups = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.spawns) ? parsed.spawns : null;
      if (!groups || groups.length > 1_000 || groups.some((item) => !isRecord(item) || typeof item.type !== 'string')) throw new Error('波次 JSON 最多包含 1,000 组。');
      const map = history.present;
      changeDocument({ ...map, waves: groups.map((item, index) => ({ ...item, type: String(item.type), begin: Number(item.begin) || 1, end: Number(item.end) || 1, amount: Number(item.amount) || 1, __editor_id: `import:${Date.now()}:${index}` })) });
      setError('');
    } catch (cause) { setError(messageFor(cause)); }
  };

  if (loading) return <main className="mx-auto max-w-6xl px-4 py-10"><p role="status" className="text-sm text-[var(--text-muted)]">正在检查在线编辑能力…</p></main>;
  if (!canEdit || !catalog) {
    const entry = pageKind === 'schematic' ? status?.schematic : pageKind === 'map' ? status?.map : status?.wave;
    return <main className="mx-auto max-w-4xl px-4 py-10"><a href="/tools" className="text-sm text-[var(--primary)]">← 返回工具箱</a><h1 className="mt-5 text-2xl font-semibold">{descriptor.title}</h1><section className="mt-4 border border-amber-500/30 bg-amber-500/5 p-5"><h2 className="font-semibold">在线编辑暂不可用</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">{statusReason(entry?.reason) || error || 'Mindustry Renderer 或资源存储尚未就绪。'}</p></section></main>;
  }

  return <main className="mx-auto w-full max-w-[1800px] px-0 sm:px-3 lg:px-5">
    <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-page)]/95 px-3 py-2 backdrop-blur"><a href="/tools" aria-label="返回工具箱" className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--border)]"><ArrowLeft className="h-4 w-4" /></a><div className="min-w-0 flex-1"><span className="block text-xs text-[var(--text-muted)]">{descriptor.title}</span>{analysis ? <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="文件名称" className="w-full max-w-sm bg-transparent text-sm font-semibold outline-none" /> : <span className="block text-sm font-semibold">准备工作区</span>}</div>
      {analysis ? <div className="flex flex-wrap gap-1"><button type="button" disabled={!history?.past.length || busy} onClick={undo} className="flex h-10 w-10 items-center justify-center border border-[var(--border)] disabled:opacity-40" aria-label="撤销"><Undo2 className="h-4 w-4" /></button><button type="button" disabled={!history?.future.length || busy} onClick={redo} className="flex h-10 w-10 items-center justify-center border border-[var(--border)] disabled:opacity-40" aria-label="重做"><Redo2 className="h-4 w-4" /></button><button type="button" onClick={() => void saveLocalDraft()} disabled={busy} className="flex min-h-10 items-center gap-1 border border-[var(--border)] px-2 text-xs sm:px-3 sm:text-sm"><Save className="h-4 w-4" /><span className="hidden sm:inline">保存草稿</span></button><button type="button" onClick={() => void handleExport()} disabled={busy} className="flex min-h-10 items-center gap-1 bg-[var(--primary)] px-3 text-xs text-white sm:text-sm">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}导出</button><button type="button" onClick={() => { setSaveTitle(sourceInfo.resourceTitle || title); setSaveVersion(suggestedVersion()); setSaveDialog(true); }} disabled={busy} className="min-h-10 border border-[var(--border)] px-2 text-xs sm:px-3 sm:text-sm">保存到资源</button></div> : null}
    </header>
    {error ? <div role="status" className="mx-3 mt-3 flex items-start justify-between gap-3 border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="关闭提示">×</button></div> : null}
    {!analysis ? <section className="mx-auto max-w-5xl px-4 py-8 sm:py-12"><h1 className="text-3xl font-semibold text-[var(--text)]">{descriptor.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">上传或选择游戏文件即可开始。编辑草稿保存在当前浏览器，导出文件由 Mindustry 官方读写器生成。</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2"><button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-32 flex-col items-start justify-center border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--primary)]"><Upload className="h-6 w-6 text-[var(--primary)]" /><span className="mt-3 font-semibold">上传 {descriptor.extension} 文件</span><span className="mt-1 text-sm text-[var(--text-muted)]">从设备选择现有{pageKind === 'schematic' ? '蓝图' : '地图'}</span></button><button type="button" onClick={() => { setShowResourcePicker((value) => !value); setTimeout(() => { if (!showResourcePicker) void loadSearchResults(); }, 0); }} className="flex min-h-32 flex-col items-start justify-center border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--primary)]"><FolderOpen className="h-6 w-6 text-[var(--primary)]" /><span className="mt-3 font-semibold">从资源中心打开</span><span className="mt-1 text-sm text-[var(--text-muted)]">也可以选择自己的资源</span></button>{pageKind === 'schematic' ? <button type="button" onClick={() => setShowPaste((value) => !value)} className="flex min-h-32 flex-col items-start justify-center border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--primary)]"><FilePlus2 className="h-6 w-6 text-[var(--primary)]" /><span className="mt-3 font-semibold">粘贴蓝图字符串</span><span className="mt-1 text-sm text-[var(--text-muted)]">从游戏分享代码直接导入</span></button> : null}<div className="border border-[var(--border)] bg-[var(--bg-card)] p-5"><div className="flex items-center gap-2"><FilePlus2 className="h-6 w-6 text-[var(--primary)]" /><h2 className="font-semibold">新建空白{pageKind === 'schematic' ? '蓝图' : '地图'}</h2></div><div className="mt-4 grid grid-cols-2 gap-2"><label className="space-y-1 text-xs"><span>宽度</span><input type="number" min="1" max={pageKind === 'schematic' ? 128 : 2000} value={newWidth} onChange={(event) => setNewWidth(Number(event.target.value))} className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg-page)] px-2 text-sm" /></label><label className="space-y-1 text-xs"><span>高度</span><input type="number" min="1" max={pageKind === 'schematic' ? 128 : 2000} value={newHeight} onChange={(event) => setNewHeight(Number(event.target.value))} className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg-page)] px-2 text-sm" /></label></div><label className="mt-2 block space-y-1 text-xs"><span>名称</span><input value={newName} onChange={(event) => setNewName(event.target.value)} className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg-page)] px-3 text-sm" /></label>{mapMode && catalog ? <><label className="mt-3 block space-y-1 text-xs"><span>游戏模式模板</span><select value={newTemplate} onChange={(event) => setNewTemplate(event.target.value as typeof newTemplate)} className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg-page)] px-3 text-sm">{[['survival', '生存'], ['sandbox', '沙盒'], ['attack', '进攻'], ['pvp', 'PvP'], ['custom', '自定义规则']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="mt-3"><p className="mb-1 text-xs">初始地形</p><ContentPicker entries={catalog.blocks.filter((entry) => entry.floor)} value={newFloor} onChange={(entry) => setNewFloor(entry.internal_name)} label="选择初始地形" className="h-40" /></div></> : null}<button type="button" onClick={() => void createBlank()} disabled={busy} className="mt-3 min-h-10 w-full bg-[var(--primary)] text-sm text-white">{busy ? '正在创建…' : '创建并编辑'}</button></div></div>
      <input ref={fileInput} type="file" accept={descriptor.extension} onChange={acceptFile} aria-label="上传编辑文件" className="hidden" />
      {showPaste ? <section className="mt-4 space-y-2 border border-[var(--border)] p-4"><label className="block space-y-2 text-sm"><span>蓝图字符串</span><textarea value={pastedSchematic} onChange={(event) => setPastedSchematic(event.target.value)} rows={4} placeholder="bXNja…" className="w-full border border-[var(--border)] bg-[var(--bg-card)] p-3 font-mono text-xs" /></label><button type="button" onClick={() => { try { void activate(base64Schematic(pastedSchematic)); } catch (cause) { setError(messageFor(cause)); } }} className="min-h-10 bg-[var(--primary)] px-4 text-sm text-white">导入蓝图</button></section> : null}
      {showResourcePicker ? <section className="mt-4 border border-[var(--border)] p-4"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setResourceMode('center'); setResourceChoices([]); }} className={`min-h-10 px-3 text-sm ${resourceMode === 'center' ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : ''}`}>资源中心</button><button type="button" onClick={() => { setResourceMode('mine'); setResourceChoices([]); }} className={`min-h-10 px-3 text-sm ${resourceMode === 'mine' ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : ''}`}>我的资源</button>{resourceMode === 'center' ? <><input value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadSearchResults(); }} placeholder="搜索资源名称" className="min-h-10 min-w-[10rem] flex-1 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm" /><button type="button" onClick={() => void loadSearchResults()} className="min-h-10 border border-[var(--border)] px-3 text-sm"><Search className="inline h-4 w-4" />搜索</button></> : <button type="button" onClick={() => void loadSearchResults()} className="min-h-10 border border-[var(--border)] px-3 text-sm">加载我的资源</button>}</div><ul className="mt-3 divide-y divide-[var(--border)]">{resourceChoices.map((item) => <li key={item.public_id}><button type="button" onClick={() => void loadResource(item.public_id)} className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm hover:text-[var(--primary)]"><span className="truncate">{item.title}</span><span className="shrink-0 text-xs text-[var(--text-muted)]">打开版本 →</span></button></li>)}{!resourceChoices.length ? <li className="py-3 text-sm text-[var(--text-muted)]">搜索或加载后选择资源。</li> : null}</ul></section> : null}
    </section> : null}
    {analysis && catalog && documentState ? <><div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">来源：{sourceInfo.resourceTitle ? `${sourceInfo.resourceTitle} · ${sourceInfo.versionId || ''}` : sourceFile?.name} · {dirty ? '有未导出更改' : '已与源文件一致'}</div>{recoverableDraft ? <div role="status" className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"><span className="flex-1">发现 {new Date(recoverableDraft.updated_at).toLocaleString()} 的本地未保存草稿。</span><button type="button" onClick={restoreDraft} className="min-h-9 bg-[var(--primary)] px-3 text-xs text-white">恢复</button><button type="button" onClick={() => void discardDraft()} className="min-h-9 border border-[var(--border)] px-3 text-xs">丢弃</button></div> : null}
      {descriptor.kind === 'schematic' && isSchematicDocument(documentState) ? <SchematicEditor analysis={analysis} catalog={catalog} document={documentState} onChange={changeDocument} fullLogic={status?.schematic.full_logic === true} /> : null}
      {mapMode && isMapDocument(documentState) ? <MapEditor analysis={analysis} catalog={catalog} document={documentState} onChange={changeDocument} mode={pageKind === 'wave' ? 'wave' : 'map'} /> : null}
      {pageKind === 'wave' ? <details className="border-b border-[var(--border)] p-3"><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">高级导入：从 JSON 文件载入波次</summary><label className="mt-2 block text-xs">选择 JSON 文件<input type="file" accept="application/json,.json" onChange={(event) => void importWaveJson(event)} aria-label="导入波次配置" className="mt-2 block w-full text-sm" /></label></details> : null}
    </> : null}
    {saveDialog ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaveDialog(false); }}><section role="dialog" aria-modal="true" aria-labelledby="save-resource-title" className="w-full max-w-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl"><h2 id="save-resource-title" className="text-lg font-semibold">{sourceInfo.resourceId && sourceInfo.canManage ? '保存为资源新版本' : '保存为资源'}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{sourceInfo.resourceId && sourceInfo.canManage ? '新文件会作为待审核版本上传到当前资源。' : '创建一个新的资源草稿；文件上传后进入资源中心审核流程。'}</p><label className="mt-4 block space-y-1 text-sm"><span>资源名称</span><input value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} disabled={Boolean(sourceInfo.resourceId && sourceInfo.canManage)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-page)] px-3 disabled:opacity-70" /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-sm"><span>版本号</span><input value={saveVersion} onChange={(event) => setSaveVersion(event.target.value)} placeholder="1.0.1" className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-page)] px-3" /></label><label className="block space-y-1 text-sm"><span>发布渠道</span><select value={saveChannel} onChange={(event) => setSaveChannel(event.target.value as typeof saveChannel)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-page)] px-3">{[['release', '正式版'], ['beta', '测试版'], ['alpha', '内测版'], ['snapshot', '快照版']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setSaveDialog(false)} className="min-h-10 border border-[var(--border)] px-4 text-sm">取消</button><button type="button" onClick={() => void saveToResource()} disabled={busy || !saveVersion.trim()} className="min-h-10 bg-[var(--primary)] px-4 text-sm text-white disabled:opacity-50">{busy ? '上传中…' : '上传资源'}</button></div></section></div> : null}
  </main>;
}

function statusReason(reason?: string | null) {
  if (!reason) return '';
  if (reason === 'resource_upload_disabled') return '站点暂时关闭了资源上传与在线编辑。';
  if (reason === 'resource_center_unavailable') return '资源存储服务暂不可用，编辑器会在服务恢复后重新开放。';
  if (reason === 'renderer_unavailable' || reason === 'renderer_not_ready') return 'Mindustry Renderer 尚未就绪，暂时无法读取或导出官方游戏文件。';
  if (reason === 'editor_operation_unavailable') return '当前 Renderer 未开放此编辑操作，请稍后重试。';
  return reason;
}
