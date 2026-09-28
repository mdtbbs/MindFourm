'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { categoryApi, postApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import type { Category, Post } from '@/types';
import ContentLanguageSelect from '@/components/forum/content-language-select';
import { useI18n } from '@/i18n/provider';

// TipTap editor is client-only
function PostEditorLoading() {
  const { t } = useI18n();
  return (
    <div role="status" className="w-full min-h-[18rem] flex items-center justify-center border border-[var(--border)] rounded-lg bg-[var(--bg-card)]">
      <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
      <span className="ml-2 text-sm text-[var(--text-muted)]">{t('postEdit.editorLoading')}</span>
    </div>
  );
}

const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: PostEditorLoading,
});

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
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(post.content_json ?? null);
  const [contentLanguage, setContentLanguage] = useState(post.content_language === 'unknown' ? '' : post.content_language || '');
  const [categoryId, setCategoryId] = useState<number | undefined>(post.category_id ?? undefined);
  const [tagsInput, setTagsInput] = useState(
    (post.tags ?? []).map((tag) => tag.name).join(', '),
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    categoryApi
      .getList()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const dirty =
    title !== post.title
    || content !== post.content
    || JSON.stringify(contentJson) !== JSON.stringify(post.content_json ?? null)
    || (contentLanguage || 'unknown') !== (post.content_language || 'unknown')
    || categoryId !== (post.category_id ?? undefined)
    || tagsInput !== (post.tags ?? []).map((tag) => tag.name).join(', ');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('postEdit.titleRequired'));
      return;
    }
    if (!content.trim()) {
      setError(t('postEdit.contentRequired'));
      return;
    }

    setSaving(true);
    try {
      await postApi.update(post.id, {
        title: trimmedTitle,
        content,
        content_json: contentJson || undefined,
        content_language: contentLanguage || 'unknown',
        category_id: categoryId,
        tags: tagsInput
          .split(/[,，]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      router.push(`/posts/${post.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('postEdit.saveFailed'));
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
        {t('postEdit.backToPost')}
      </Link>

      <h1 className="text-2xl font-semibold text-[var(--text)] mb-6">{t('postEdit.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <ContentLanguageSelect value={contentLanguage} onChange={setContentLanguage} />
        <div>
          <label htmlFor="post-title" className="block text-sm font-medium text-[var(--text)] mb-2">
            {t('postEdit.titleLabel')}
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
            {t('postEdit.category')}
          </label>
          <select
            id="post-category"
            value={categoryId ?? ''}
            onChange={(event) =>
              setCategoryId(event.target.value ? Number(event.target.value) : undefined)
            }
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <option value="">{t('postEdit.noCategory')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="post-content" className="block text-sm font-medium text-[var(--text)] mb-2">
            {t('postEdit.content')}
          </label>
          <TiptapEditor
            value={content}
            onChange={setContent}
            jsonValue={contentJson}
            onJsonChange={setContentJson}
            testId="post-edit-content"
            id="post-content"
            ariaLabel={t('postEdit.content')}
            placeholder={t('postEdit.contentPlaceholder')}
            minHeight="18rem"
            imageUpload
          />
        </div>

        <div>
          <label htmlFor="post-tags" className="block text-sm font-medium text-[var(--text)] mb-2">
            {t('postEdit.tags')}
          </label>
          <input
            id="post-tags"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder={t('postEdit.tagsPlaceholder')}
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
            {saving ? t('postEdit.saving') : t('postEdit.save')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push(`/posts/${post.id}`)}>
            {t('postEdit.cancel')}
          </Button>
          {!dirty && <span className="text-sm text-[var(--text-muted)]">{t('postEdit.unchanged')}</span>}
        </div>
      </form>
    </div>
  );
}
