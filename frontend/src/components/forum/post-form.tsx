'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth/context';
import { postApi, categoryApi, tagApi, getCommunityChallenge, type CommunityChallengeDescriptor, type CommunityChallengeProof } from '@/lib/api/client';
import { CreatePostInput, Category, Tag } from '@/types';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import { DraftSnapshot, useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import DraftRecovery from '@/components/ui/draft-recovery';
import { Send, Save, Loader2 } from 'lucide-react';
import { useToastStore } from '@/store/toast-store';
import { useI18n } from '@/i18n/provider';
import { PostComposerPresentation } from '@/components/rich-content/post-composer-presentation';
import ContentLanguageSelect from '@/components/forum/content-language-select';
import CommunityChallengeDialog from '@/components/forum/community-challenge-dialog';

// TipTap editor is client-only (depends on document/window)
const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => null,
});

export default function PostForm() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const showSuccess = useToastStore((state) => state.showSuccess);

  // Form fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentLanguage, setContentLanguage] = useState('');
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(null);
  const [categoryId, setCategoryId] = useState<string>('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<CommunityChallengeDescriptor | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<CreatePostInput | null>(null);

  // Reference data
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Validation errors
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');
  const [recoverableDraft, setRecoverableDraft] = useState<DraftSnapshot | null>(null);

  // Draft
  const draft = useDraft('post');
  const saveDraft = draft.save;
  const draftValues = useMemo(() => ({ title, content, contentJson, contentLanguage, categoryId, tagsInput, status }), [title, content, contentJson, contentLanguage, categoryId, tagsInput, status]);
  const hasDraftContent = Boolean(title.trim() || content.trim() || categoryId || tagsInput.trim() || status === 'draft');
  useDraftAutoSave(draftValues, draft.save, hasDraftContent && !isSubmitting);

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
    setRecoverableDraft(draft.load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const persistBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!hasDraftContent || isSubmitting) return;
      saveDraft(draftValues);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', persistBeforeLeave);
    return () => window.removeEventListener('beforeunload', persistBeforeLeave);
  }, [saveDraft, draftValues, hasDraftContent, isSubmitting]);

  // Starting a new post is an explicit choice too; never leave an old recovery
  // button around that could overwrite what the user has just typed.
  useEffect(() => {
    if (hasDraftContent && recoverableDraft) setRecoverableDraft(null);
  }, [hasDraftContent, recoverableDraft]);

  const restoreDraft = () => {
    const saved = recoverableDraft?.values;
    if (!saved) return;
    if (typeof saved.title === 'string') setTitle(saved.title);
    if (typeof saved.content === 'string') setContent(saved.content);
    if (typeof saved.contentLanguage === 'string') setContentLanguage(saved.contentLanguage);
    if (saved.contentJson && typeof saved.contentJson === 'object') setContentJson(saved.contentJson as Record<string, unknown>);
    if (typeof saved.categoryId === 'string') setCategoryId(saved.categoryId);
    if (typeof saved.tagsInput === 'string') setTagsInput(saved.tagsInput);
    if (saved.status === 'draft' || saved.status === 'published') setStatus(saved.status);
    setRecoverableDraft(null);
  };

  const discardDraft = () => {
    draft.clear();
    setRecoverableDraft(null);
  };

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
    if (!title.trim()) { setTitleError(t('postForm.titleRequired')); valid = false; } else { setTitleError(''); }
    if (!content.trim()) { setContentError(t('postForm.contentRequired')); valid = false; } else { setContentError(''); }
    return valid;
  };

  // ── Submit ───────────────────────────────────────────────
  const submitPost = async (input: CreatePostInput, proof?: CommunityChallengeProof) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const post = await postApi.create(input, proof);
      draft.clear();
      showSuccess(status === 'draft' ? t('postForm.draftSaved') : t('postForm.published'));
      // Redirect to the new post page
      router.push(`/posts/${post.id}`);
    } catch (err) {
      const requiredChallenge = getCommunityChallenge(err);
      if (requiredChallenge) {
        setPendingSubmission(input);
        setChallenge(requiredChallenge);
        setIsSubmitting(false);
        return;
      }
      setChallenge(null);
      setError(err instanceof Error ? err.message : t('postForm.submitFailed'));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    const input: CreatePostInput = {
      title: title.trim(),
      content: content.trim(),
      content_language: contentLanguage || 'unknown',
      content_json: contentJson || undefined,
      content_schema_version: contentJson ? 2 : undefined,
      category_id: categoryId ? Number(categoryId) : undefined,
      tags: parseTags(),
      status,
    };
    void submitPost(input);
  };

  const verifyChallenge = (response: string) => {
    if (!challenge || !pendingSubmission) return;
    void submitPost(pendingSubmission, { token: challenge.token, response });
  };

  // The session probe is intentionally not a page-wide blocking state. A failed
  // probe used to leave guests on /posts/new at “加载中...” forever; the API still
  // authorizes the eventual write, while guests immediately get a login action.
  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-8">
          <h2 className="text-xl font-bold text-[var(--text)] mb-3">{t('postForm.joinTitle')}</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            {t('postForm.joinDescription')}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href={`/login?redirect=${encodeURIComponent(pathname || '/posts/new')}`}
              className="inline-flex items-center px-6 py-3 rounded-lg bg-[var(--primary-button)] text-white font-medium hover:opacity-90 transition-opacity"
            >
              {t('postForm.login')}
            </Link>
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              {t('postForm.backForum')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const categoryOptions = [
    { value: '', label: t('postForm.optionalCategory') },
    ...categories.map(c => ({ value: String(c.id), label: c.name })),
  ];

  const availableTagNames = tags.map(t => t.name).join('、');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Header ──────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">{t('postForm.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t('postForm.help')}
        </p>
      </div>

      {/* ── Alerts ──────────────────────────────────── */}
      {error && <Alert type="error" message={error} className="mb-4" />}
      {recoverableDraft && (
        <DraftRecovery
          savedAt={recoverableDraft.timestamp}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
          className="mb-4"
        />
      )}
      {draft.saveError && <Alert type="error" message={draft.saveError} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-5">
        <PostComposerPresentation title={title} json={contentJson} markdown={content}>
          {/* ── Title ─────────────────────────────────── */}
          <div>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); if (titleError) setTitleError(''); }}
              placeholder={t('postForm.titlePlaceholder')}
              maxLength={200}
              className={`w-full rounded-[var(--radius)] border bg-[var(--bg-card)] px-4 py-3 text-xl font-semibold text-[var(--text)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20
                ${titleError ? 'border-[var(--error)]' : 'border-[var(--border)]'}`}
            />
            {titleError && <p className="ml-1 mt-1.5 text-sm text-[var(--error)]">{titleError}</p>}
          </div>

          {/* ── Editor ────────────────────────────────── */}
          <div>
            <TiptapEditor
              value={content}
              onChange={setContent}
              jsonValue={contentJson}
              onJsonChange={setContentJson}
              testId="post-content-editor"
              ariaLabel={t('postForm.bodyLabel')}
              placeholder={t('postForm.bodyPlaceholder')}
              minHeight="280px"
              imageUpload
              className={contentError ? 'rounded-[var(--radius-card)] ring-1 ring-[var(--error)]' : ''}
            />
            {contentError && (
              <p className="ml-1 mt-1.5 text-sm text-[var(--error)]">{contentError}</p>
            )}
          </div>

          {/* ── Metadata row ──────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Category */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                {t('postForm.category')}
              </label>
              <Select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                options={categoryOptions}
              />
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                {t('postForm.tags')}
              </label>
              <Input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder={t('postForm.tagsPlaceholder')}
                maxLength={200}
              />
              {availableTagNames && <p className="mt-1 truncate text-xs text-[var(--text-muted)]" title={availableTagNames}>{t('postForm.tagsAvailable', { tags: availableTagNames })}</p>}
            </div>

            <ContentLanguageSelect value={contentLanguage} onChange={setContentLanguage} content={`${title}\n${content}`} />

            {/* Status */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                {t('postForm.status')}
              </label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="status" value="published"
                    checked={status === 'published'} onChange={() => setStatus('published')}
                    className="accent-[var(--primary)] focus:ring-[var(--primary)]" />
                  <span className="text-sm text-[var(--text-secondary)]">{t('postForm.publish')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="status" value="draft"
                    checked={status === 'draft'} onChange={() => setStatus('draft')}
                    className="accent-[var(--primary)] focus:ring-[var(--primary)]" />
                  <span className="text-sm text-[var(--text-secondary)]">{t('postForm.draft')}</span>
                </label>
              </div>
            </div>
          </div>


        </PostComposerPresentation>

        {/* ── Actions ───────────────────────────────── */}
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-card)]/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:py-4 lg:backdrop-blur-none lg:bottom-auto">
          <Button type="button" variant="secondary" onClick={() => { if (hasDraftContent) draft.save(draftValues); router.back(); }}>
            {t('postForm.cancel')}
          </Button>
          <div className="flex flex-wrap gap-2 items-center">
            <Button type="button" variant="secondary" data-testid="save-local-draft"
              onClick={() => { if (draft.save(draftValues)) showSuccess(t('postForm.savedToDevice')); }}>
              <Save className="w-4 h-4 inline mr-1" />
              <span className="hidden sm:inline">{t('postForm.saveToDevice')}</span><span className="sm:hidden">{t('richPresentation.saveLocal')}</span>
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="publish-button">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                  {t('postForm.submitting')}
                </>
              ) : status === 'draft' ? (
                <>
                  <Save className="w-4 h-4 inline mr-1" />
                  {t('postForm.saveDraft')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 inline mr-1" />
                  {t('postForm.publishPost')}
                </>
              )}
            </Button>
            {draft.lastSavedAt && hasDraftContent && (
              <span className="hidden text-xs text-[var(--text-muted)] sm:inline">{t('postForm.savedToDevice')}</span>
            )}
          </div>
        </div>
      </form>
      {challenge && <CommunityChallengeDialog challenge={challenge} onCancel={() => { setChallenge(null); setPendingSubmission(null); }} onVerify={verifyChallenge} busy={isSubmitting} />}
    </div>
  );
}
