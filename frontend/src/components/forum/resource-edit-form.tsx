'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Upload } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Resource, ResourceCategory } from '@/types';
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

interface ResourceEditFormProps {
  resource: Resource;
}

export default function ResourceEditForm({ resource }: ResourceEditFormProps) {
  const router = useRouter();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [title, setTitle] = useState(resource.title || '');
  const [version, setVersion] = useState(resource.version || '');
  const [description, setDescription] = useState(resource.description || '');
  const [categoryId, setCategoryId] = useState<number | null>(resource.category_id || null);
  const [isPublic, setIsPublic] = useState(resource.is_public !== false);
  const [content, setContent] = useState(resource.content || '');
  const [externalUrl, setExternalUrl] = useState(resource.external_url || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resourceApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('请填写标题');
      return;
    }

    if (resource.resource_type === 'external' && !externalUrl.trim()) {
      setError('请填写外链地址');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updateData: Partial<Resource> = {
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        is_public: isPublic,
        content: content.trim() || null,
      };

      if (version.trim()) {
        updateData.version = version.trim();
      }

      if (resource.resource_type === 'external') {
        updateData.external_url = externalUrl.trim();
      }

      await resourceApi.update(resource.id, updateData);
      showSuccess('资源更新成功！');
      router.push(`/resources/${resource.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
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

      <Input
        label="标题 *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="资源标题"
        required
        maxLength={200}
      />

      <Input
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
          ariaLabel="资源短介绍"
          placeholder="会显示在资源列表标题下方，支持富文本和图片"
          minHeight="120px"
          compact
          imageUpload
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">分类</label>
        <select
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
          ariaLabel="资源正文"
          placeholder="使用富文本编辑器详细介绍资源内容、使用方式和注意事项，支持粘贴 / 拖放上传图片"
          minHeight="260px"
          imageUpload
        />
      </div>

      {resource.resource_type === 'external' && (
        <Input
          label="外链地址 *"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://github.com/... 或其他资源链接"
          required
          type="url"
        />
      )}

      {resource.resource_type === 'upload' && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <p className="text-sm text-[var(--text-muted)]">
            文件资源不支持修改文件，如需更换文件请删除后重新上传。
          </p>
          {resource.file_name && (
            <p className="mt-2 text-sm text-[var(--text)]">
              当前文件: <span className="font-medium">{resource.file_name}</span>
            </p>
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
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? '保存中...' : '保存修改'}
        </button>
      </div>
    </form>
  );
}
