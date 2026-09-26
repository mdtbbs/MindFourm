'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ClipboardPaste, ExternalLink, Loader2, Map, Upload } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { ResourceCategory } from '@/types';
import { RESOURCE_KINDS } from '@/lib/display-labels';
import { useToastStore } from '@/store/toast-store';
import { DraftSnapshot, useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import DraftRecovery from '@/components/ui/draft-recovery';

type ResourceType = 'upload' | 'external';
type SchematicSource = 'file' | 'paste';

const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
      <span className="ml-2 text-xs text-[var(--text-muted)]">加载编辑器…</span>
    </div>
  ),
});

export default function ResourceSubmitForm() {
  const router = useRouter();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resourceType, setResourceType] = useState<ResourceType | null>(null);
  const [resourceKind, setResourceKind] = useState('other');
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [content, setContent] = useState('');
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [schematicSource, setSchematicSource] = useState<SchematicSource>('file');
  const [schematicCode, setSchematicCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingFileDuplicates, setCheckingFileDuplicates] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<{ exact: boolean; existing_resources: Array<{ id: number | null; title: string; url: string }>; similar_resources?: Array<{ id: number | null; title: string; url: string }> } | null>(null);
  const submissionKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const fileHash = useRef<{ file: File; hash: string } | null>(null);
  const duplicateCheckSequence = useRef(0);
  const [recoverableDraft, setRecoverableDraft] = useState<DraftSnapshot | null>(null);
  const draft = useDraft('resource');
  const saveDraft = draft.save;
  const draftValues = useMemo(
    () => ({ resourceType, resourceKind, title, version, description, categoryId, isPublic, content, contentJson, externalUrl, schematicSource, schematicCode }),
    [resourceType, resourceKind, title, version, description, categoryId, isPublic, content, contentJson, externalUrl, schematicSource, schematicCode],
  );
  const hasDraftContent = Boolean(resourceType || title || version || description || content || externalUrl || schematicCode);
  useDraftAutoSave(draftValues, draft.save, hasDraftContent && !isSubmitting);

  useEffect(() => {
    resourceApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setRecoverableDraft(draft.load());
  // A draft is checked exactly once when this new-resource form mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = () => {
    const saved = recoverableDraft?.values;
    if (!saved) return;
    if (saved.resourceType === 'upload' || saved.resourceType === 'external') setResourceType(saved.resourceType);
    if (typeof saved.resourceKind === 'string') setResourceKind(saved.resourceKind);
    if (typeof saved.title === 'string') setTitle(saved.title);
    if (typeof saved.version === 'string') setVersion(saved.version);
    if (typeof saved.description === 'string') setDescription(saved.description);
    if (typeof saved.categoryId === 'number') setCategoryId(saved.categoryId);
    if (typeof saved.isPublic === 'boolean') setIsPublic(saved.isPublic);
    if (typeof saved.content === 'string') setContent(saved.content);
    if (saved.contentJson && typeof saved.contentJson === 'object') setContentJson(saved.contentJson as Record<string, unknown>);
    if (typeof saved.externalUrl === 'string') setExternalUrl(saved.externalUrl);
    if (saved.schematicSource === 'file' || saved.schematicSource === 'paste') setSchematicSource(saved.schematicSource);
    if (typeof saved.schematicCode === 'string') setSchematicCode(saved.schematicCode);
    setRecoverableDraft(null);
  };

  const discardDraft = () => {
    draft.clear();
    setRecoverableDraft(null);
  };

  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!hasDraftContent || isSubmitting) return;
      saveDraft(draftValues);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [saveDraft, draftValues, hasDraftContent, isSubmitting]);

  useEffect(() => {
    if (hasDraftContent && recoverableDraft) setRecoverableDraft(null);
  }, [hasDraftContent, recoverableDraft]);

  const isMap = resourceKind === 'map';
  const isSchematic = resourceKind === 'schematic';
  const isForumManagedKind = isMap || isSchematic;

  useEffect(() => {
    if (isForumManagedKind && resourceType !== 'upload') setResourceType('upload');
  }, [isForumManagedKind, resourceType]);

  const checkSelectedFile = async (selectedFile: File | null) => {
    const sequence = ++duplicateCheckSequence.current;
    fileHash.current = null;
    setDuplicateNotice(null);
    setError(null);
    if (!selectedFile) {
      setCheckingFileDuplicates(false);
      return;
    }
    setCheckingFileDuplicates(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', await selectedFile.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (sequence !== duplicateCheckSequence.current) return;
      fileHash.current = { file: selectedFile, hash };
      const duplicate = await resourceApi.checkDuplicate({ content_hash: hash, resource_kind: resourceKind, title: title.trim() });
      if (sequence !== duplicateCheckSequence.current) return;
      setDuplicateNotice(duplicate);
      if (duplicate.exact) setError('这个文件已经提交过了。请先查看已有资源；如资源归属有误，请联系管理处理。');
    } catch (cause) {
      if (sequence === duplicateCheckSequence.current) setError(cause instanceof Error ? cause.message : '无法检查文件是否重复');
    } finally {
      if (sequence === duplicateCheckSequence.current) setCheckingFileDuplicates(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resourceType) {
      setError('请选择资源类型');
      return;
    }

    if (!title.trim()) {
      setError('请填写标题');
      return;
    }

    if (!version.trim()) {
      setError('请填写资源版本');
      return;
    }

    if (isSchematic && schematicSource === 'paste' && !schematicCode.trim()) {
      setError('请粘贴从 Mindustry 复制的蓝图代码');
      return;
    }

    if (resourceType === 'upload' && (!file && !(isSchematic && schematicSource === 'paste'))) {
      setError('请选择要上传的文件');
      return;
    }

    if (resourceType === 'external' && !externalUrl.trim()) {
      setError('请填写外链地址');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('resource_type', resourceType);
      formData.append('resource_kind', resourceKind);

      formData.append('version', version.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (categoryId) formData.append('category_id', String(categoryId));
      formData.append('is_public', isPublic ? '1' : '0');
      if (content.trim()) formData.append('content', content.trim());
      if (contentJson) formData.append('content_json', JSON.stringify(contentJson));

      if (isSchematic && schematicSource === 'paste') {
        formData.append('schematic_code', schematicCode.trim());
      } else if (resourceType === 'external') {
        formData.append('external_url', externalUrl.trim());
      } else if (file) {
        formData.append('file', file);
      }

      let contentHash: string | undefined;
      if (file) {
        if (fileHash.current?.file === file) contentHash = fileHash.current.hash;
        else {
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          contentHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        }
      }
      const duplicate = await resourceApi.checkDuplicate({
        ...(contentHash ? { content_hash: contentHash } : {}),
        resource_kind: resourceKind,
        ...(resourceType === 'external' ? { source_url: externalUrl.trim() } : {}),
        title: title.trim(),
      });
      setDuplicateNotice(duplicate);
      if (duplicate.exact) {
        setError('检测到相同文件或来源的资源。请先查看已有资源，避免重复提交。');
        return;
      }
      const fingerprint = JSON.stringify({ contentHash, resourceKind, resourceType, title: title.trim(), version: version.trim(), externalUrl: externalUrl.trim(), description: description.trim(), categoryId, isPublic });
      if (!submissionKey.current || submissionKey.current.fingerprint !== fingerprint) {
        submissionKey.current = { fingerprint, key: crypto.randomUUID() };
      }

      const resource = await resourceApi.upload(formData, submissionKey.current.key);
      draft.clear();
      showSuccess('资源提交成功！');
      router.push(`/resources/${resource.id}`);
    } catch (err) {
      const existingResource = (err as { existingResource?: { id: number | null; title: string; url: string } | null }).existingResource;
      if (existingResource) setDuplicateNotice({ exact: true, existing_resources: [existingResource] });
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-6"
    >
      {recoverableDraft && (
        <DraftRecovery
          savedAt={recoverableDraft.timestamp}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
        />
      )}
      {draft.saveError && (
        <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {draft.saveError}
        </div>
      )}
      {error && (
        <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {duplicateNotice && (duplicateNotice.exact || duplicateNotice.similar_resources?.length) && <div className={`rounded-[var(--radius)] border p-3 text-sm ${duplicateNotice.exact ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]'}`}>
        <p className="font-medium">{duplicateNotice.exact ? '发现重复资源' : '发现标题或来源相近的资源'}</p>
        <ul className="mt-2 space-y-1">{[...duplicateNotice.existing_resources, ...(duplicateNotice.similar_resources || [])].map((item) => <li key={`${item.id}-${item.title}`}><a className="underline underline-offset-2" href={item.url || `/resources/${item.id}`} target="_blank" rel="noreferrer">{item.title} · #{item.id}</a></li>)}</ul>
      </div>}

      {!isForumManagedKind ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-secondary)]">资源类型 *</p>
          <div className="grid gap-3 sm:grid-cols-2">
          <label
            data-testid="resource-type-upload"
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              resourceType === 'upload'
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] bg-[var(--bg-elevated)]'
            }`}
          >
            <input
              type="radio"
              name="resourceType"
              value="upload"
              checked={resourceType === 'upload'}
              onChange={() => setResourceType('upload')}
              className="sr-only"
            />
            <div className="flex items-start gap-3">
              <Upload className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">文件</div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  上传压缩包、地图、存档、图片等文件资源
                </p>
              </div>
            </div>
          </label>

          <label
            data-testid="resource-type-external"
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              resourceType === 'external'
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] bg-[var(--bg-elevated)]'
            }`}
          >
            <input
              type="radio"
              name="resourceType"
              value="external"
              checked={resourceType === 'external'}
              onChange={() => setResourceType('external')}
              className="sr-only"
            />
            <div className="flex items-start gap-3">
              <ExternalLink className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">外链</div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  填写 GitHub、网盘、文档站等资源链接
                </p>
              </div>
            </div>
          </label>
          </div>
        </div>
      ) : (
        <div
          data-testid="resource-managed-kind-notice"
          className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4"
        >
          <div className="flex items-start gap-3">
            <Map className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{isMap ? '地图提交' : '蓝图提交'}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                {isMap
                  ? '地图会以本站托管的 .msav 文件提交，审核通过后生成预览图。'
                  : '蓝图仅保存为本站托管的 .msch 文件：可上传文件，也可粘贴游戏中复制的蓝图代码。'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">资源类型 *</label>
        <select
          value={resourceKind}
          onChange={(event) => {
            const nextKind = event.target.value;
            if (nextKind === 'map' || nextKind === 'schematic') {
              router.push(`/resources/submit/${nextKind}`);
              return;
            }
            setResourceKind(nextKind);
            setFile(null);
            setSchematicCode('');
            setSchematicSource('file');
            if (nextKind === 'map' || nextKind === 'schematic') setResourceType('upload');
          }}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)]"
        >
          {RESOURCE_KINDS.map(({ value, label }) => <option key={value} value={value}>{value === 'map' || value === 'schematic' ? `${label}（专用工作台）` : label}</option>)}
        </select>
        {(resourceKind === 'map' || resourceKind === 'schematic') && <p className="text-xs text-[var(--text-muted)]">{resourceKind === 'map' ? '地图仅接受 .msav 文件；审核通过后会自动生成预览图。' : '蓝图仅接受 .msch 文件；审核通过后会自动生成预览图。'}</p>}
      </div>

      <Input
        data-testid="resource-title-input"
        label="标题 *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="资源标题"
        required
        maxLength={200}
      />

      <Input
        data-testid="resource-version-input"
        label="版本号"
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder="例如 1.0、v2.0"
        maxLength={50}
      />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">短介绍</label>
        <textarea
          data-testid="resource-description-input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-label="资源短介绍"
          placeholder="用几句话介绍资源，会显示在资源列表中。"
          maxLength={300}
          rows={3}
          className="w-full resize-y rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        />
        <p className="text-right text-xs text-[var(--text-muted)]">{description.length}/300</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">专题 / 用途</label>
        <select
          data-testid="resource-category-select"
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)]"
        >
          <option value="">不选择</option>
          {categories
            .filter((category) => category.is_active)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
        <p className="mt-1 text-xs text-[var(--text-muted)]">专题用于说明玩法或用途，不会改变资源类型。</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">正文（长介绍）</label>
        <TiptapEditor
          value={content}
          onChange={setContent}
          jsonValue={contentJson}
          onJsonChange={setContentJson}
          ariaLabel="资源正文"
          placeholder="使用富文本编辑器详细介绍资源内容、使用方式和注意事项，支持粘贴 / 拖放上传图片"
          minHeight="260px"
          imageUpload
          testId="resource-content-input"
        />
      </div>

      {resourceType === 'external' && (
        <Input
          data-testid="resource-external-url-input"
          label="外链地址 *"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://github.com/... 或其他资源链接"
          required
          type="url"
        />
      )}

      {isSchematic && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <p className="text-sm font-medium text-[var(--text)]">蓝图来源 *</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-testid="schematic-source-file"
              onClick={() => { setSchematicSource('file'); setSchematicCode(''); }}
              className={`rounded-lg border px-3 py-3 text-left text-sm ${schematicSource === 'file' ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]'}`}
            >
              <Upload className="mb-1 h-4 w-4 text-[var(--primary)]" />
              上传 .msch 文件
            </button>
            <button
              type="button"
              data-testid="schematic-source-paste"
              onClick={() => { setSchematicSource('paste'); setFile(null); }}
              className={`rounded-lg border px-3 py-3 text-left text-sm ${schematicSource === 'paste' ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]'}`}
            >
              <ClipboardPaste className="mb-1 h-4 w-4 text-[var(--primary)]" />
              粘贴游戏蓝图代码
            </button>
          </div>
          {schematicSource === 'paste' && (
            <div className="space-y-2">
              <textarea
                data-testid="schematic-code-input"
                value={schematicCode}
                onChange={(event) => setSchematicCode(event.target.value)}
                className="min-h-36 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 font-mono text-xs text-[var(--text)]"
                placeholder="在 Mindustry 中复制蓝图后，将以 bXNja... 开头的代码粘贴到这里"
                spellCheck={false}
              />
              <p className="text-xs text-[var(--text-muted)]">论坛会将代码转换为受审核的 .msch 附件；不会保存或跳转外链。</p>
            </div>
          )}
        </div>
      )}

      {resourceType === 'upload' && (!isSchematic || schematicSource === 'file') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">{isMap ? '地图文件 (.msav) *' : isSchematic ? '蓝图文件 (.msch) *' : '文件 *'}</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border-2 border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
            <Upload className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="flex-1 truncate text-sm text-[var(--text)]">
              {file?.name || (isMap ? '选择 .msav 地图文件' : isSchematic ? '选择 .msch 蓝图文件' : '选择要上传的文件')}
            </span>
            <input
              data-testid="resource-file-input"
              type="file"
              accept={resourceKind === 'map' ? '.msav' : resourceKind === 'schematic' ? '.msch' : '.zip,.rar,.7z,.tar,.gz,.jar,.msav,.msch,.json,.hjson,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif'}
              onChange={(e) => { const selectedFile = e.target.files?.[0] || null; setFile(selectedFile); void checkSelectedFile(selectedFile); }}
              className="hidden"
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">最大 50MB</p>

        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">可见性</label>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
            <span className="text-sm">公开</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <span className="text-sm">私有</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => { if (hasDraftContent) draft.save(draftValues); router.back(); }}
          className="rounded-[var(--radius)] bg-[var(--bg-elevated)] px-4 py-2 text-sm hover:bg-[var(--bg-card)]"
        >
          取消
        </button>
        <button
          data-testid="resource-submit-button"
          type="submit"
          disabled={isSubmitting || checkingFileDuplicates || Boolean(duplicateNotice?.exact)}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {resourceType === 'external' ? <ExternalLink className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {checkingFileDuplicates ? '正在检查文件…' : isSubmitting ? '提交中...' : '提交资源'}
        </button>
        {draft.lastSavedAt && hasDraftContent && (
          <span className="self-center text-xs text-[var(--text-muted)]">已保存到此设备</span>
        )}
      </div>
    </form>
  );
}
