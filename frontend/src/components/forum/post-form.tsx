'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth/context';
import { postApi, categoryApi, tagApi } from '@/lib/api/client';
import { CreatePostInput, Category, Tag } from '@/types';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import { useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import { Send, Save, Loader2 } from 'lucide-react';
import { useToastStore } from '@/store/toast-store';

// TipTap editor is client-only (depends on document/window)
const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => (
    <div className="w-full min-h-[200px] flex items-center justify-center border border-surface-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900">
      <Loader2 className="w-5 h-5 animate-spin text-surface-400" />
      <span className="ml-2 text-sm text-surface-400">加载编辑器…</span>
    </div>
  ),
});

export default function PostForm() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const showSuccess = useToastStore((state) => state.showSuccess);

  // Form fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reference data
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Validation errors
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');

  // Draft
  const draft = useDraft('post');
  const draftValues = { title, content, categoryId, tagsInput, status };
  useDraftAutoSave(draftValues, draft.save);

  // Load categories & tags
  useEffect(() => {
    let cancelled = false;
    Promise.all([categoryApi.getList(), tagApi.getList()])
      .then(([cats, tgs]) => {
        if (!cancelled) { setCategories(cats); setTags(tgs); }
      })
      .catch(() => { if (!cancelled) console.error('Failed to load categories/tags'); });
    return () => { cancelled = true; };
  }, []);

  // Restore draft
  useEffect(() => {
    const saved = draft.load();
    if (saved) {
      if (saved.title) setTitle(saved.title as string);
      if (saved.content) setContent(saved.content as string);
      if (saved.categoryId) setCategoryId(saved.categoryId as string);
      if (saved.tagsInput) setTagsInput(saved.tagsInput as string);
      if (saved.status) setStatus(saved.status as 'draft' | 'published');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ──────────────────────────────────────────────
  const parseTags = (): string[] =>
    tagsInput
      .split(/[,，]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => {
        const matched = tags.find(tag => tag.name.toLowerCase() === t.toLowerCase());
        return matched ? matched.slug : t.toLowerCase().replace(/\s+/g, '-');
      });

  const validate = (): boolean => {
    let valid = true;
    if (!title.trim()) { setTitleError('请输入标题'); valid = false; } else { setTitleError(''); }
    if (!content.trim()) { setContentError('请输入内容'); valid = false; } else { setContentError(''); }
    return valid;
  };

  // ── Submit ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      showSuccess(status === 'draft' ? '草稿已保存' : '帖子发布成功！');
      // Redirect to the new post page
      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发帖失败，请重试');
      setIsSubmitting(false);
    }
  };

  // ── Loading / Auth ───────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-surface-500 text-sm">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-8">
          <h2 className="text-xl font-bold text-[var(--text)] mb-3">加入讨论</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            登录后你可以发帖、回复、收藏、关注感兴趣的内容
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href={`/login?redirect=${encodeURIComponent(pathname || '/posts/new')}`}
              className="inline-flex items-center px-6 py-3 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity"
            >
              登录
            </a>
            <a
              href="/"
              className="inline-flex items-center px-6 py-3 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              返回论坛
            </a>
          </div>
        </div>
      </div>
    );
  }

  const categoryOptions = [
    { value: '', label: '选择分类（可选）' },
    ...categories.map(c => ({ value: String(c.id), label: c.name })),
  ];

  const availableTagNames = tags.map(t => t.name).join('、');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Header ──────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100">发布新帖子</h1>
        <p className="text-sm text-surface-500 dark:text-gray-400 mt-1">
          使用富文本编辑器编写，支持粘贴 / 拖放上传图片
        </p>
      </div>

      {/* ── Alerts ──────────────────────────────────── */}
      {error && <Alert type="error" message={error} className="mb-4" />}
      {draft.hasDraft && (
        <Alert type="info" message="已自动恢复上次未保存的草稿" className="mb-4" />
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Title ─────────────────────────────────── */}
        <div>
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); if (titleError) setTitleError(''); }}
            placeholder="请输入帖子标题"
            maxLength={200}
            className={`w-full text-xl font-semibold px-4 py-3 bg-white dark:bg-gray-800 border rounded-xl
              focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition
              text-surface-900 dark:text-gray-100 placeholder:text-surface-400 dark:placeholder:text-gray-500
              ${titleError ? 'border-red-400' : 'border-surface-200 dark:border-gray-700'}`}
          />
          {titleError && <p className="text-sm text-red-500 mt-1.5 ml-1">{titleError}</p>}
        </div>

        {/* ── Editor ────────────────────────────────── */}
        <div>
          <TiptapEditor
            value={content}
            onChange={setContent}
            placeholder="使用富文本编辑器编写帖子内容，支持粘贴 / 拖放上传图片..."
            minHeight="280px"
            imageUpload
            className={contentError ? 'ring-1 ring-red-400 rounded-xl' : ''}
          />
          {contentError && (
            <p className="text-sm text-red-500 mt-1.5 ml-1">{contentError}</p>
          )}
        </div>

        {/* ── Metadata row ──────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1.5">
              分类
            </label>
            <Select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              options={categoryOptions}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1.5">
              标签
            </label>
            <Input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="逗号分隔"
              maxLength={200}
            />
            {availableTagNames && (
              <p className="text-xs text-surface-400 mt-1 truncate" title={availableTagNames}>
                可用：{availableTagNames}
              </p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1.5">
              状态
            </label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" value="published"
                  checked={status === 'published'} onChange={() => setStatus('published')}
                  className="text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-surface-700 dark:text-gray-300">发布</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" value="draft"
                  checked={status === 'draft'} onChange={() => setStatus('draft')}
                  className="text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-surface-700 dark:text-gray-300">草稿</span>
              </label>
            </div>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-surface-200 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            取消
          </Button>
          <div className="flex gap-3 items-center">
            <Button type="button" variant="secondary"
              onClick={() => { draft.save(draftValues); }}>
              <Save className="w-4 h-4 inline mr-1" />
              存草稿
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                  提交中...
                </>
              ) : status === 'draft' ? (
                <>
                  <Save className="w-4 h-4 inline mr-1" />
                  保存草稿
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 inline mr-1" />
                  发布帖子
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
