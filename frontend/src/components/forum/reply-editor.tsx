'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Reply } from '@/types';
import Button from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Alert from '@/components/ui/alert';
import { DraftSnapshot, useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import DraftRecovery from '@/components/ui/draft-recovery';
import { useToastStore } from '@/store/toast-store';
import { getCommunityChallenge, type CommunityChallengeDescriptor, type CommunityChallengeProof } from '@/lib/api/client';
import CommunityChallengeDialog from '@/components/forum/community-challenge-dialog';
import { useI18n } from '@/i18n/provider';

// TipTap editor is client-only
const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => (
    <div className="w-full min-h-[120px] flex items-center justify-center border border-surface-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" aria-busy="true">
      <Loader2 className="w-4 h-4 animate-spin text-surface-400" />
    </div>
  ),
});

interface ReplyEditorProps {
  postId: number;
  onSubmit: (content: string, parentReplyId?: number, contentJson?: Record<string, unknown>, proof?: CommunityChallengeProof) => Promise<Reply | void>;
  quoteReply?: Reply | null;
  replyToReply?: Reply | null;
  /** Clears the quote / reply-to target without submitting. */
  onCancelTarget?: () => void;
}

export default function ReplyEditor({
  postId,
  onSubmit,
  quoteReply,
  replyToReply,
  onCancelTarget,
}: ReplyEditorProps) {
  const [content, setContent] = useState('');
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recoverableDraft, setRecoverableDraft] = useState<DraftSnapshot | null>(null);
  const [challenge, setChallenge] = useState<CommunityChallengeDescriptor | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<{ content: string; parentReplyId?: number; contentJson?: Record<string, unknown> } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const showSuccess = useToastStore((state) => state.showSuccess);
  const { t } = useI18n();

  const replyId = quoteReply?.id ?? replyToReply?.id;
  const draft = useDraft('reply', replyId ? `r-${replyId}` : `p-${postId}`);
  const loadDraft = draft.load;
  const saveDraft = draft.save;
  useDraftAutoSave({ content, contentJson }, draft.save, !!content && !isSubmitting);

  // Restore the draft when the editor mounts or switches target (quote/reply-to).
  useEffect(() => {
    setRecoverableDraft(loadDraft());
  }, [loadDraft]);

  useEffect(() => {
    const persistBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!content.trim() || isSubmitting) return;
      saveDraft({ content, contentJson });
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', persistBeforeLeave);
    return () => window.removeEventListener('beforeunload', persistBeforeLeave);
  }, [content, contentJson, saveDraft, isSubmitting]);

  useEffect(() => {
    if (content.trim() && recoverableDraft) setRecoverableDraft(null);
  }, [content, recoverableDraft]);

  const restoreDraft = () => {
    const savedContent = recoverableDraft?.values.content;
    if (typeof savedContent === 'string') setContent(savedContent);
    const savedJson = recoverableDraft?.values.contentJson;
    if (savedJson && typeof savedJson === 'object') setContentJson(savedJson as Record<string, unknown>);
    setRecoverableDraft(null);
  };

  const discardDraft = () => {
    draft.clear();
    setRecoverableDraft(null);
  };

  // The composer sits below a paginated reply list, so bring it into view when a
  // quote/reply target is picked — otherwise the buttons look like they did nothing.
  useEffect(() => {
    if (!replyId) return;
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [replyId]);

  const submitReply = async (
    input: { content: string; parentReplyId?: number; contentJson?: Record<string, unknown> },
    proof?: CommunityChallengeProof,
  ) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const reply = await onSubmit(
        input.content,
        input.parentReplyId,
        input.contentJson,
        proof,
      );
      setContent('');
      setContentJson(null);
      draft.clear();
      setChallenge(null);
      setPendingSubmission(null);
      const msg = reply?.status === 'pending' ? t('replyEditor.pendingSuccess') : t('replyEditor.success');
      setSuccess(msg);
      showSuccess(msg);
    } catch (err) {
      const requiredChallenge = getCommunityChallenge(err);
      if (requiredChallenge) {
        setChallenge(requiredChallenge);
        setPendingSubmission(input);
      } else {
        setChallenge(null);
        setError(err instanceof Error ? err.message : t('replyEditor.submitFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    void submitReply({ content, parentReplyId: quoteReply?.id || replyToReply?.id, contentJson: contentJson || undefined });
  };

  const verifyChallenge = (response: string) => {
    if (!challenge || !pendingSubmission) return;
    void submitReply(pendingSubmission, { token: challenge.token, response });
  };

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 overflow-hidden"
    >
      <div className="px-4 py-3 bg-surface-50 dark:bg-gray-800 border-b border-surface-200 dark:border-gray-700">
        <h3 className="font-semibold text-surface-900 dark:text-gray-100">
          {quoteReply ? t('replyEditor.quoteTitle') : replyToReply ? t('replyEditor.replyTitle') : t('replyEditor.title')}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="p-4">
        {(quoteReply || replyToReply) && (
          <div className="mb-4 flex items-start justify-between gap-3 p-3 bg-surface-50 dark:bg-gray-800 border-l-4 border-primary-500 text-sm text-surface-600 dark:text-gray-300">
            <span>
              {quoteReply ? t('replyEditor.quoteTarget', { id: quoteReply.id }) : t('replyEditor.replyTarget', { id: replyToReply!.id })}
            </span>
            {onCancelTarget && (
              <button
                type="button"
                onClick={onCancelTarget}
                className="shrink-0 text-xs underline hover:text-surface-900 dark:hover:text-gray-100"
              >
                {t('replyEditor.cancel')}
              </button>
            )}
          </div>
        )}

        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} className="mt-3" />}
        {recoverableDraft && (
          <DraftRecovery
            savedAt={recoverableDraft.timestamp}
            onRestore={restoreDraft}
            onDiscard={discardDraft}
            className="mb-3"
          />
        )}
        {draft.saveError && <Alert type="error" message={draft.saveError} className="mt-3" />}

        <TiptapEditor
          value={content}
          onChange={setContent}
          jsonValue={contentJson}
          onJsonChange={setContentJson}
          ariaLabel={t('replyEditor.bodyLabel')}
          placeholder={t('replyEditor.placeholder')}
          minHeight="120px"
          compact
          imageUpload
        />

        <div className="mt-4 flex items-center justify-end gap-3">
          {draft.lastSavedAt && content.trim() && (
            <span className="text-xs text-surface-400">{t('replyEditor.savedOnDevice')}</span>
          )}
          <Button
            type="submit"
            disabled={isSubmitting || !content.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                  {t('replyEditor.submitting')}
              </>
            ) : t('replyEditor.submit')}
          </Button>
        </div>
      </form>
      {challenge && <CommunityChallengeDialog challenge={challenge} onCancel={() => { setChallenge(null); setPendingSubmission(null); }} onVerify={verifyChallenge} busy={isSubmitting} />}
    </div>
  );
}
