'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { useAuth } from '@/lib/auth/context';
import { postApi, categoryApi, tagApi } from '@/lib/api/client';
import { CreatePostInput, Category, Tag } from '@/types';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import { Eye, Edit3 } from 'lucide-react';
import { useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import FileUpload from '@/components/forum/file-upload';
import AttachmentList from '@/components/forum/attachment-list';
import { Attachment } from '@/types';

export default function PostForm() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Form fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');

  // UI state
  const [preview, setPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdPostId, setCreatedPostId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Reference data
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Draft
  const draft = useDraft('post');
  const draftValues = { title, content, categoryId, tagsInput, status };
  useDraftAutoSave(draftValues, draft.save);

  // Validation errors
  const [titleError, setTitleError] = useState<string>('');
  const [contentError, setContentError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([categoryApi.getList(), tagApi.getList()])
      .then(([cats, tgs]) => {
        if (!cancelled) {
          setCategories(cats);
          setTags(tgs);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load categories/tags:', err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore draft on mount
  useEffect(() => {
    const saved = draft.load();
    if (saved) {
      if (saved.title) setTitle(saved.title as string);
      if (saved.content) setContent(saved.content as string);
      if (saved.categoryId) setCategoryId(saved.categoryId as string);
      if (saved.tagsInput) setTagsInput(saved.tagsInput as string);
      if (saved.status) setStatus(saved.status as 'draft' | 'published');
    }
  }, [draft]);

  // Redirect after successful creation
  useEffect(() => {
    if (createdPostId !== null) {
      router.push(`/posts/${createdPostId}`);
    }
  }, [createdPostId, router]);

  const parseTags = (): string[] => {
    return tagsInput
      .split(/[,，]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        // If the input matches a known tag name, use its slug
        const matched = tags.find(
          (tag) => tag.name.toLowerCase() === t.toLowerCase()
        );
        return matched ? matched.slug : t.toLowerCase().replace(/\s+/g, '-');
      });
  };

  const validate = (): boolean => {
    let valid = true;
    if (!title.trim()) {
      setTitleError('请输入标题');
      valid = false;
    } else {
      setTitleError('');
    }
    if (!content.trim()) {
      setContentError('请输入内容');
      valid = false;
    } else {
      setContentError('');
    }
    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const input: CreatePostInput = {
        title: title.trim(),
        content: content.trim(),
        category_id: categoryId ? Number(categoryId) : undefined,
        tags: parseTags(),
        status,
      };

      const post = await postApi.create(input);
      draft.clear();
      setSuccess(true);
      setCreatedPostId(post.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发帖失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show auth loading spinner
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-surface-500">加载中...</div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Alert
          type="warning"
          message="请先登录后再发帖"
          className="mb-4"
        />
        <div className="text-center">
          <a
            href="/login"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            前往登录 &rarr;
          </a>
        </div>
      </div>
    );
  }

  const categoryOptions = [
    { value: '', label: '选择分类（可选）' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-surface-900 mb-6">发布新帖子</h1>

      {success && (
        <Alert
          type="success"
          message="帖子发布成功，正在跳转..."
          className="mb-4"
        />
      )}
      {error && (
        <Alert
          type="error"
          message={error}
          className="mb-4"
        />
      )}
      {draft.hasDraft && (
        <Alert
          type="warning"
          message="检测到未保存的草稿，已自动恢复"
          className="mb-4"
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-6">
        {/* Title */}
        <Input
          label="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="请输入帖子标题"
          error={titleError}
          maxLength={200}
          required
        />

        {/* Category */}
        <Select
          label="分类"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={categoryOptions}
        />

        {/* Tags */}
        <Input
          label="标签"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="输入标签，用逗号分隔"
          maxLength={200}
        />
        {tags.length > 0 && (
          <p className="text-xs text-surface-400 -mt-4">
            可用标签：{tags.map((t) => t.name).join('、')}
          </p>
        )}

        {/* Content - Markdown Editor with Edit/Preview toggle */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            内容 <span className="text-red-500">*</span>
          </label>

          {/* Toggle buttons */}
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreview(false)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                !preview
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-600 hover:bg-surface-100'
              }`}
            >
              <Edit3 className="w-4 h-4 inline mr-1" />
              编辑
            </button>
            <button
              type="button"
              onClick={() => setPreview(true)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                preview
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-600 hover:bg-surface-100'
              }`}
            >
              <Eye className="w-4 h-4 inline mr-1" />
              预览
            </button>
          </div>

          {preview ? (
            <MarkdownRenderer content={content} className="min-h-[200px] p-4 bg-surface-50 dark:bg-gray-800 rounded-lg border border-surface-200 dark:border-gray-700" fallback="*暂无内容*" />
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="使用 Markdown 格式编写帖子内容..."
              className={`w-full min-h-[200px] px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y bg-white dark:bg-gray-800 text-surface-900 dark:text-gray-100 placeholder:text-surface-400 dark:placeholder:text-gray-500 ${
                contentError ? 'border-red-500' : 'border-surface-300 dark:border-gray-600'
              }`}
            />
          )}
          {contentError && (
            <p className="text-sm text-red-600 mt-1">{contentError}</p>
          )}
        </div>

        {/* Attachments */}
        {createdPostId && (
          <>
            <FileUpload postId={createdPostId} onUploaded={(newAttachments) => setAttachments((prev) => [...prev, ...newAttachments])} />
            {attachments.length > 0 && <AttachmentList attachments={attachments} />}
          </>
        )}

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-2">
            状态
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="published"
                checked={status === 'published'}
                onChange={() => setStatus('published')}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-surface-700">发布</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="draft"
                checked={status === 'draft'}
                onChange={() => setStatus('draft')}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-surface-700">草稿</span>
            </label>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            取消
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? '发布中...' : '发布帖子'}
          </Button>
        </div>
      </form>
    </div>
  );
}
