'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClipboardPaste, FileImage, Loader2, Map, ShieldCheck, Upload } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { ResourceCategory } from '@/types';
import { useToastStore } from '@/store/toast-store';

type Kind = 'map' | 'schematic';
type SchematicSource = 'file' | 'paste';
type DraftPreview = {
  id: string;
  preview_url: string;
  metadata: Record<string, unknown> | null;
  parser_version: string | null;
  expires_at: string;
};

const copy: Record<Kind, { title: string; short: string; extension: string; action: string }> = {
  map: { title: '地图提交工作台', short: '上传地图并在提交前检查缩略图和地图信息。', extension: '.msav', action: '提交地图审核' },
  schematic: { title: '蓝图提交工作台', short: '上传蓝图文件，或粘贴游戏中复制的蓝图代码。', extension: '.msch', action: '提交蓝图审核' },
};

function displayMetadata(metadata: Record<string, unknown> | null): Array<[string, string]> {
  if (!metadata) return [];
  const labels: Record<string, string> = { name: '名称', author: '作者', width: '宽度', height: '高度', spawns: '出生点', blocks: '方块数', version: '文件版本', build: 'Mindustry Build', tags: '自动标签' };
  return Object.entries(metadata)
    .filter(([key, value]) => labels[key] && (typeof value === 'string' || typeof value === 'number' || (key === 'tags' && Array.isArray(value))))
    .map(([key, value]) => [labels[key], Array.isArray(value) ? value.join('、') : String(value)]);
}

export default function MindustryResourceWorkbench({ kind }: { kind: Kind }) {
  const router = useRouter();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const text = copy[kind];
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [schematicSource, setSchematicSource] = useState<SchematicSource>('file');
  const [schematicCode, setSchematicCode] = useState('');
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { resourceApi.getCategories().then(setCategories).catch(() => {}); }, []);

  const resetPreview = () => setPreview(null);
  const usePastedCode = kind === 'schematic' && schematicSource === 'paste';
  const selectFile = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(text.extension)) {
      setError(`仅支持 ${text.extension} 文件`);
      return;
    }
    setFile(candidate);
    setError(null);
    resetPreview();
  };

  const generatePreview = async () => {
    if (usePastedCode && !schematicCode.trim()) {
      setError('请粘贴从 Mindustry 复制的蓝图代码');
      return;
    }
    if (!usePastedCode && !file) {
      setError(`请选择 ${text.extension} 文件`);
      return;
    }
    setIsPreviewing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('resource_kind', kind);
      if (usePastedCode) formData.append('schematic_code', schematicCode.trim());
      else if (file) formData.append('file', file);
      const nextPreview = await resourceApi.previewDraft(formData);
      setPreview(nextPreview);
      const parsed = nextPreview.metadata || {};
      if (!title.trim() && typeof parsed.name === 'string' && parsed.name.trim()) setTitle(parsed.name.trim());
      if (!description.trim() && typeof parsed.description === 'string' && parsed.description.trim()) setDescription(parsed.description.trim());
      // This is the resource release label, not a guessed Mindustry build.
      // The renderer deliberately returns no build for files without a marker.
      if (!version.trim()) setVersion(typeof parsed.build === 'number' && parsed.build > 1 ? `Build ${parsed.build}` : '未标注');
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : '预览生成失败');
    } finally {
      setIsPreviewing(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    if (!preview) {
      setError('请先解析文件并生成预览');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('version', version.trim() || '未标注');
      formData.append('resource_type', 'upload');
      formData.append('resource_kind', kind);
      formData.append('preview_draft_id', preview.id);
      formData.append('is_public', isPublic ? '1' : '0');
      if (description.trim()) formData.append('description', description.trim());
      if (content.trim()) formData.append('content', content.trim());
      if (categoryId) formData.append('category_id', String(categoryId));
      const resource = await resourceApi.upload(formData);
      showSuccess(`${kind === 'map' ? '地图' : '蓝图'}已提交审核`);
      router.push(`/resources/${resource.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重新生成预览后再试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs font-medium text-[var(--primary)]"><ShieldCheck className="h-3.5 w-3.5" />论坛托管 · 审核后公开</p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{text.title}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{text.short} 不支持外链下载。</p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">先生成私有预览，再提交审核</p>
      </div>

      {error && <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <section className="space-y-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--text)]">1. 选择内容并预览</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">预览仅当前登录用户可见，30 分钟后自动失效。</p>
          </div>

          {kind === 'schematic' && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--bg-elevated)] p-1">
              <button type="button" onClick={() => { setSchematicSource('file'); setSchematicCode(''); resetPreview(); }} className={`rounded-md px-3 py-2 text-sm ${schematicSource === 'file' ? 'bg-[var(--bg-card)] font-medium text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]'}`}><Upload className="mr-1 inline h-4 w-4" />上传文件</button>
              <button type="button" onClick={() => { setSchematicSource('paste'); setFile(null); resetPreview(); }} className={`rounded-md px-3 py-2 text-sm ${schematicSource === 'paste' ? 'bg-[var(--bg-card)] font-medium text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]'}`}><ClipboardPaste className="mr-1 inline h-4 w-4" />粘贴代码</button>
            </div>
          )}

          {!usePastedCode ? (
            <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }} className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-5 text-center hover:border-[var(--primary)]/60">
              <Upload className="mb-2 h-7 w-7 text-[var(--primary)]" />
              <span className="text-sm font-medium text-[var(--text)]">{file?.name || `选择 ${text.extension} 文件`}</span>
              <span className="mt-1 text-xs text-[var(--text-muted)]">最大 20 MB，文件不会在提交审核前公开</span>
              <input type="file" accept={text.extension} className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />
            </label>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">游戏蓝图代码</label>
              <textarea value={schematicCode} onChange={(event) => { setSchematicCode(event.target.value); resetPreview(); }} spellCheck={false} placeholder="在 Mindustry 中复制蓝图后，将以 bXNja... 开头的代码粘贴到这里" className="min-h-44 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs text-[var(--text)]" />
            </div>
          )}

          <button type="button" onClick={generatePreview} disabled={isPreviewing} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
            {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
            {isPreviewing ? '正在解析并生成预览…' : '解析并生成预览'}
          </button>

          <div className="border-t border-[var(--border)] pt-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">2. 补充资源信息</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={kind === 'map' ? '地图名称 *' : '蓝图名称 *'} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
              <Input label="资源版本（可选）" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="未标注" maxLength={50} />
            </div>
            <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">短介绍</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} className="mt-1 min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text)]" placeholder="说明玩法、用途或使用方式" />
            <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">分类</label>
            <select value={categoryId ?? ''} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]">
              <option value="">不选择</option>
              {categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">详细说明</label>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} className="mt-1 min-h-32 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text)]" placeholder="可说明版本、玩法、使用步骤和注意事项" />
            <label className="mt-4 flex items-center gap-2 text-sm text-[var(--text)]"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />审核通过后公开发布</label>
          </div>
        </section>

        <aside className="h-fit rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:sticky sm:top-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-[var(--text)]">提交前预览</h2>{preview && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-4 w-4" />已解析</span>}</div>
          {preview ? (
            <>
              <div className={`overflow-hidden rounded-xl bg-[#101419] ${kind === 'map' ? 'aspect-video' : 'aspect-square'}`}><img src={preview.preview_url} alt={`${kind === 'map' ? '地图' : '蓝图'}预览`} className="h-full w-full object-contain" /></div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {displayMetadata(preview.metadata).map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className="mt-0.5 break-words text-[var(--text)]">{value}</dd></div>)}
              </dl>
              <p className="mt-4 text-xs text-[var(--text-muted)]">已验证文件格式。提交后仍需通过论坛审核才会公开。</p>
            </>
          ) : (
            <div className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center"><Map className="mb-3 h-8 w-8 text-[var(--text-muted)]" /><p className="text-sm text-[var(--text-muted)]">选择内容并生成预览后，这里会显示解析结果。</p></div>
          )}
          <button type="submit" disabled={!preview || isSubmitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}{isSubmitting ? '正在提交…' : text.action}</button>
        </aside>
      </div>
    </form>
  );
}
