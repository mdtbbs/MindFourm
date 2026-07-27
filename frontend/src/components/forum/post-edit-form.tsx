'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, Pencil } from 'lucide-react';
import { categoryApi, postApi } from '@/lib/api/client';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Button } from '@/components/ui/button';
import type { Category, Post } from '@/types';

interface PostEditFormProps {
  post: Post;
}

/**
 * Editing a published post.
 *
 * Separate from `post-form.tsx` rather than a mode flag on it: that component carries
 * the whole creation flow — draft autosave, attachment upload after the post exists, a
 * server selector — none of which applies to editing, and threading a mode through all
 * of it would put the create path at risk for no gain.
 *
 * `status` is deliberately never submitted. The API rejects the entire request with 403
 * when a non-moderator includes it, so sending the post's own current status back would
 * make every author's edit fail.
 */
export default function PostEditForm({ post }: PostEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [categoryId, setCategoryId] = useState<number | undefined>(post.category_id ?? undefined);
  const [tagsInput, setTagsInput] = useState(
    (post.tags ?? []).map((tag) => tag.name).join(', '),
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    categoryApi
      .getList()
      .then(setCategories)
      // A failed category list must not block editing the text; the field just falls
      // back to "keep current".
      .catch(() => setCategories([]));
  }, []);

  const dirty =
    title !== post.title
    || content !== post.content
    || categoryId !== (post.category_id ?? undefined)
    || tagsInput !== (post.tags ?? []).map((tag) => tag.name).join(', ');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('标题不能为空');
      return;
    }
    if (!content.trim()) {
      setError('内容不能为空');
      return;
    }

    setSaving(true);
    try {
      await postApi.update(post.id, {
        // Trimmed on submit, not just validated — the previous account edit page
        // validated the trimmed value and then sent the untrimmed one.
        title: trimmedTitle,
        content,
        category_id: categoryId,
        tags: tagsInput
          .split(/[,，]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      // refresh() so the server-rendered detail page picks up the new content, rather
      // than navigating to a cached copy of the old one.
      router.push(`/posts/${post.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/posts/${post.id}`}
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回帖子
      </Link>

      <h1 className="text-2xl font-semibold text-[var(--text)] mb-6">编辑帖子</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="post-title" className="block text-sm font-medium text-[var(--text)] mb-2">
            标题
          </label>
          <input
            id="post-title"
            data-testid="post-edit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          />
        </div>

        <div>
          <label htmlFor="post-category" className="block text-sm font-medium text-[var(--text)] mb-2">
            分类
          </label>
          <select
            id="post-category"
            value={categoryId ?? ''}
            onChange={(event) =>
              setCategoryId(event.target.value ? Number(event.target.value) : undefined)
            }
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <option value="">不设置分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="post-content" className="block text-sm font-medium text-[var(--text)]">
              内容
            </label>
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]"
            >
              {preview ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {preview ? '继续编辑' : '预览'}
            </button>
          </div>
          {preview ? (
            <div className="min-h-[18rem] px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <textarea
              id="post-content"
              data-testid="post-edit-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={16}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] font-mono text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            />
          )}
        </div>

        <div>
          <label htmlFor="post-tags" className="block text-sm font-medium text-[var(--text)] mb-2">
            标签
          </label>
          <input
            id="post-tags"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="逗号分隔"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !dirty} data-testid="post-edit-submit">
            {saving ? '保存中…' : '保存修改'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push(`/posts/${post.id}`)}>
            取消
          </Button>
          {!dirty && <span className="text-sm text-[var(--text-muted)]">尚未修改</span>}
        </div>
      </form>
    </div>
  );
}
