'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Upload } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { ResourceCategory } from '@/types';
import { useToastStore } from '@/store/toast-store';

type ResourceType = 'upload' | 'external';

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
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [content, setContent] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [useMfl, setUseMfl] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resourceApi.getCategories().then(setCategories).catch(() => {});
  }, []);

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

    if (resourceType === 'upload' && !file) {
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

      if (version.trim()) formData.append('version', version.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (categoryId) formData.append('category_id', String(categoryId));
      formData.append('is_public', isPublic ? '1' : '0');
      if (content.trim()) formData.append('content', content.trim());

      if (resourceType === 'external') {
        formData.append('external_url', externalUrl.trim());
      } else if (file) {
        formData.append('file', file);
        if (useMfl) {
          formData.append('use_mfl', '1');
        }
      }

      const resource = await resourceApi.upload(formData);
      showSuccess('资源提交成功！');
      router.push(`/resources/${resource.id}`);
    } catch (err) {
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
      {error && (
        <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-surface-700 dark:text-gray-300">资源类型 *</p>
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
        <TiptapEditor
          value={description}
          onChange={setDescription}
          placeholder="会显示在资源列表标题下方，支持富文本和图片"
          minHeight="120px"
          compact
          imageUpload
          testId="resource-description-input"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">分类</label>
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
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">正文（长介绍）</label>
        <TiptapEditor
          value={content}
          onChange={setContent}
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

      {resourceType === 'upload' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">文件 *</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border-2 border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
            <Upload className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="flex-1 truncate text-sm text-[var(--text)]">
              {file?.name || '选择要上传的文件'}
            </span>
            <input
              data-testid="resource-file-input"
              type="file"
              accept=".zip,.rar,.7z,.tar,.gz,.jar,.msav,.msch,.json,.hjson,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">最大 50MB</p>

          {file && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <input
                type="checkbox"
                checked={useMfl}
                onChange={(e) => setUseMfl(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--text)]">上传到文件站 (MindFileList)</span>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  文件将托管在文件站，获取直链。审核期间文件名称可见但不可下载。
                </p>
              </div>
            </label>
          )}
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
          onClick={() => router.back()}
          className="rounded-[var(--radius)] bg-[var(--bg-elevated)] px-4 py-2 text-sm hover:bg-[var(--bg-card)]"
        >
          取消
        </button>
        <button
          data-testid="resource-submit-button"
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {resourceType === 'external' ? <ExternalLink className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {isSubmitting ? '提交中...' : '提交资源'}
        </button>
      </div>
    </form>
  );
}
