'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resourceApi } from '@/lib/api/client';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import { Upload } from 'lucide-react';

const CATEGORIES = [
  { value: '', label: '选择分类（可选）' },
  { value: '文档', label: '文档' },
  { value: '教程', label: '教程' },
  { value: '工具', label: '工具' },
  { value: '模板', label: '模板' },
  { value: '其他', label: '其他' },
];

export default function ResourceUploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      formData.append('description', description.trim());
      formData.append('category', category);
      formData.append('is_public', String(isPublic));
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100 mb-6">上传资源</h1>

      {error && <Alert type="error" message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-6">
        <Input
          label="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="资源标题"
          required
          maxLength={200}
        />

        <Textarea
          label="描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="资源描述（可选）"
          rows={3}
        />

        <Select
          label="分类"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={CATEGORIES}
        />

        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-2">
            可见性
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} className="text-primary-600" />
              <span className="text-sm text-surface-700 dark:text-gray-300">公开</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} className="text-primary-600" />
              <span className="text-sm text-surface-700 dark:text-gray-300">私有</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-2">
            文件 <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-3 p-4 border-2 border-dashed border-surface-300 dark:border-gray-600 rounded-lg">
            <Upload className="w-6 h-6 text-surface-400" />
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="flex-1 text-sm"
            />
          </div>
          <p className="text-xs text-surface-400 dark:text-gray-500 mt-1">
            最大 50MB
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '上传中...' : '上传'}
          </Button>
        </div>
      </form>
    </div>
  );
}
