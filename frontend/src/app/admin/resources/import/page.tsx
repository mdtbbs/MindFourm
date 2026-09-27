'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, FileDown, Upload } from 'lucide-react';
import { resourceAdminApi, type ResourceTransferManifest } from '@/lib/api/client';
import { useI18n } from '@/i18n/provider';

const RESOURCE_FILE_TYPES = '.zip,.rar,.7z,.tar,.gz,.jar,.msav,.msch,.json,.hjson,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif';

function sourceDownloadUrl(manifest: ResourceTransferManifest | null): string | null {
  const raw = manifest?.resource.file_download_url;
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    const expectedHost = manifest?.origin.site === 'mdtbbs' ? 'mdtbbs.cn' : 'mindustry.club';
    return url.protocol === 'https:' && url.hostname === expectedHost && url.pathname.startsWith('/api/resources/')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export default function ResourceImportPage() {
  const { locale } = useI18n();
  const english = locale !== 'zh-CN';
  const [manifest, setManifest] = useState<ResourceTransferManifest | null>(null);
  const [manifestName, setManifestName] = useState('');
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const text = english ? {
    title: 'Import a community resource',
    intro: 'Load a transfer manifest exported by the other community. Upload resources need a local copy of the source file; external resources use their public link.',
    manifest: 'Transfer manifest (.json)',
    sourceFile: 'Resource file',
    public: 'Make the imported copy public',
    import: 'Import resource',
    back: 'Back to resource management',
    noManifest: 'Choose a valid Mindustry resource transfer manifest first.',
    needFile: 'Choose the resource file downloaded from the source community.',
    loaded: 'Loaded',
    result: 'Import complete. The target community now owns an independent resource record; discussions, ratings, favorites, downloads, and moderation remain local.',
    invalid: 'That file is not a supported resource transfer manifest.',
  } : {
    title: '跨站导入资源',
    intro: '读取另一社区导出的迁移清单。托管文件资源需要先下载源文件并在此重新上传；外链资源沿用其公开链接。',
    manifest: '迁移清单（.json）',
    sourceFile: '资源文件',
    public: '将导入副本设为公开',
    import: '导入资源',
    back: '返回资源管理',
    noManifest: '请先选择有效的 Mindustry 资源迁移清单。',
    needFile: '请选择从来源社区下载的资源文件。',
    loaded: '已读取',
    result: '导入完成。目标社区已创建独立资源记录；评论、评分、收藏、下载量和审核状态均由本站独立维护。',
    invalid: '文件不是受支持的资源迁移清单。',
  };

  const loadManifest = async (file?: File) => {
    setError('');
    setMessage('');
    setManifest(null);
    setManifestName(file?.name || '');
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ResourceTransferManifest;
      if (parsed.format !== 'mindustry-resource/v1'
        || !parsed.origin?.site || !parsed.origin?.resource_id || !parsed.origin?.url
        || !parsed.resource?.title
        || !['upload', 'external'].includes(parsed.resource.resource_type)) {
        throw new Error(text.invalid);
      }
      setManifest(parsed);
      setIsPublic(parsed.resource.is_public !== 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.invalid);
    }
  };

  const handleImport = async () => {
    setError('');
    setMessage('');
    if (!manifest) { setError(text.noManifest); return; }
    if (manifest.resource.resource_type === 'upload' && !resourceFile) { setError(text.needFile); return; }

    const form = new FormData();
    form.set('manifest', JSON.stringify(manifest));
    form.set('is_public', isPublic ? '1' : '0');
    if (resourceFile) form.set('file', resourceFile);

    setBusy(true);
    try {
      const result = await resourceAdminApi.importManifest(form);
      setMessage(`${text.result} ${english ? 'Resource ID' : '资源 ID'}: ${result.resource.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (english ? 'Import failed.' : '导入失败。'));
    } finally {
      setBusy(false);
    }
  };

  const downloadUrl = sourceDownloadUrl(manifest);

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/resources" className="inline-flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900">
        <ArrowLeft className="h-4 w-4" />{text.back}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-surface-900">{text.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-surface-600">{text.intro}</p>
      </header>

      <section className="space-y-5 border border-surface-200 bg-white p-5">
        <label className="block space-y-2 text-sm font-medium text-surface-800">
          <span>{text.manifest}</span>
          <input type="file" accept=".json,application/json" onChange={(event) => void loadManifest(event.target.files?.[0])}
            className="block w-full border border-surface-200 p-2 text-sm" />
        </label>

        {manifest ? (
          <div className="border-l-2 border-surface-300 bg-surface-50 px-4 py-3 text-sm">
            <div className="font-medium text-surface-900">{manifest.resource.title}</div>
            <div className="mt-1 text-xs text-surface-500">
              {text.loaded} {manifestName} · {manifest.origin.site} / {manifest.origin.resource_id}
            </div>
            {downloadUrl ? (
              <a className="mt-2 inline-flex items-center gap-2 text-xs text-blue-700 hover:underline"
                href={downloadUrl} target="_blank" rel="noreferrer">
                <FileDown className="h-3.5 w-3.5" />{english ? 'Open source download' : '打开来源文件下载'}
              </a>
            ) : null}
          </div>
        ) : null}

        {manifest?.resource.resource_type === 'upload' ? (
          <label className="block space-y-2 text-sm font-medium text-surface-800">
            <span>{text.sourceFile}</span>
            <input type="file" accept={RESOURCE_FILE_TYPES} onChange={(event) => setResourceFile(event.target.files?.[0] || null)}
              className="block w-full border border-surface-200 p-2 text-sm" />
            {resourceFile ? <span className="block text-xs font-normal text-surface-500">{resourceFile.name}</span> : null}
          </label>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-surface-700">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          {text.public}
        </label>

        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-green-700">{message}</p> : null}
        <button type="button" onClick={() => void handleImport()} disabled={busy || !manifest}
          className="inline-flex items-center gap-2 border border-surface-900 bg-surface-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
          <Upload className="h-4 w-4" />{busy ? (english ? 'Importing…' : '正在导入…') : text.import}
        </button>
      </section>
    </main>
  );
}
