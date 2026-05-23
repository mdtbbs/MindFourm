'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resourceApi } from '@/lib/api/client';
import { ResourceCategory } from '@/types';
import MarkdownEditor from '@/components/ui/markdown-editor';
import { Input } from '@/components/ui/input';
import { Upload, Loader2 } from 'lucide-react';

export default function ResourceUploadForm() {
  const router = useRouter();
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resourceApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) {
      setError('请填写标题并选择文件');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('resource_type', 'file');
      if (version) formData.append('version', version);
      if (categoryId) formData.append('category_id', String(categoryId));
      formData.append('is_public', String(isPublic));
      if (content) formData.append('content', content);
      formData.append('file', file);

      const resource = await resourceApi.upload(formData);
      router.push(`/resources/${resource.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)] p-6">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-[var(--radius)] text-red-600 dark:text-red-400 text-sm">
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
        placeholder="例如: 1.0、v2.0（可选）"
        maxLength={50}
      />

      <div>
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">类别</label>
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : null)}
          className="w-full px-4 py-2 bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)]"
        >
          <option value="">不选择</option>
          {categories.filter(c => c.is_active).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <MarkdownEditor
        label="资源介绍"
        value={content}
        onChange={setContent}
        placeholder="使用 Markdown 格式介绍资源..."
        rows={8}
      />

      <div>
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">可见性</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
            <span className="text-sm">公开</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <span className="text-sm">私有</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">文件 *</label>
        <div className="flex items-center gap-3 p-4 border-2 border-dashed border-[var(--border)] rounded-[var(--radius)]">
          <Upload className="w-6 h-6 text-[var(--text-muted)]" />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="flex-1 text-sm"
          />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1">最大 50MB</p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm bg-[var(--bg-elevated)] rounded-[var(--radius)] hover:bg-[var(--bg-card)]"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius)] hover:bg-[var(--primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSubmitting ? '上传中...' : '上传'}
        </button>
      </div>
    </form>
  );
}