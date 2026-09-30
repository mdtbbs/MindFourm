'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Button from '@/components/ui/button';
import { LikeButton } from '@/components/forum/like-button';
import ReportDialog from '@/components/forum/report-dialog';
import ReactionBar from '@/components/forum/reaction-bar';
import { useReplyComposeStore } from '@/store/reply-compose-store';
import { useAuth } from '@/store/user-store';
import { postApi, replyApi } from '@/lib/api/client';
import { useToastStore } from '@/store/toast-store';
import type { Reply } from '@/types';
import { CheckCircle2, Loader2, Pencil, Quote, Reply as ReplyIcon, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: ReplyEditorLoading,
});

function ReplyEditorLoading() {
  const { t } = useI18n();
  return <div className="min-h-[120px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{t('replyActions.editorLoading')}</div>;
}

interface ReplyActionsProps {
  reply: Reply;
  /** Scopes the compose target so only this post's composer reacts. */
  postId: number;
  /** Whether the viewer may accept an answer here — the post's author, or staff. */
  canAcceptAnswer?: boolean;
  /** True when this reply is the currently accepted answer. */
  isBestReply?: boolean;
}

/**
 * The interactive footer of a reply.
 *
 * Split out so `ReplyItem` — and with it the Markdown rendering — can stay on the
 * server. Previously the whole reply was a client component solely because of these
 * buttons, so a 50-reply page shipped 50 client components that each re-parsed their
 * Markdown during hydration.
 *
 * Edit and delete live here because the API has always accepted `PUT`/`DELETE
 * /replies/:id` and nothing in the UI ever called them: a member could post a reply and
 * then had no way to correct or withdraw it.
 */
export default function ReplyActions({
  reply,
  postId,
  canAcceptAnswer = false,
  isBestReply = false,
}: ReplyActionsProps) {
  const { t } = useI18n();
  const quote = useReplyComposeStore((state) => state.quote);
  const replyTo = useReplyComposeStore((state) => state.replyTo);
  const { user } = useAuth();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.content);
  const [draftJson, setDraftJson] = useState<Record<string, unknown> | null>(reply.content_json ?? null);
  const [busy, setBusy] = useState(false);

  const isStaff = user?.role === 'admin' || user?.role === 'moderator';
  // The API authorises both operations itself; this only decides what to offer.
  const canModify = (user != null && user.id === reply.user_id) || isStaff;

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      showError(t('replyActions.empty'));
      return;
    }

    setBusy(true);
    try {
      const updatedReply = await replyApi.update(reply.id, trimmed, draftJson || undefined, draftJson ? 2 : undefined);
      showSuccess(t('replyActions.saved'));
      setEditing(false);
      window.dispatchEvent(new CustomEvent('mdtbbs:reply-mutation', { detail: { postId, type: 'update', reply: updatedReply } }));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('replyActions.saveFailed'));
    }
    setBusy(false);
  };

  const toggleBestAnswer = async () => {
    setBusy(true);
    try {
      // Passing null clears the mark; the API treats it as "no accepted answer".
      await postApi.setBestReply(postId, isBestReply ? null : reply.id);
      showSuccess(isBestReply ? t('replyActions.unaccepted') : t('replyActions.accepted'));
      window.dispatchEvent(new CustomEvent('mdtbbs:reply-mutation', { detail: { postId, type: 'best', replyId: isBestReply ? null : reply.id } }));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('replyActions.operationFailed'));
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm(t('replyActions.deleteConfirm'))) return;

    setBusy(true);
    try {
      await replyApi.delete(reply.id);
      showSuccess(t('replyActions.deleted'));
      window.dispatchEvent(new CustomEvent('mdtbbs:reply-mutation', { detail: { postId, type: 'delete', replyId: reply.id } }));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('replyActions.deleteFailed'));
    }
    setBusy(false);
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)]">
      {editing && (
        <div className="px-4 pt-3">
          <label htmlFor={`reply-edit-${reply.id}`} className="sr-only">
            {t('replyActions.editorLabel')}
          </label>
          <TiptapEditor
            id={`reply-edit-${reply.id}`}
            testId={`reply-edit-input-${reply.id}`}
            value={draft}
            onChange={setDraft}
            jsonValue={draftJson}
            onJsonChange={setDraftJson}
            ariaLabel={t('replyActions.editorAria')}
            placeholder={t('replyActions.placeholder')}
            minHeight="120px"
            compact
            imageUpload
          />
          <div className="flex items-center gap-2 mt-2 mb-1">
            <Button size="sm" onClick={save} disabled={busy} data-testid={`reply-edit-save-${reply.id}`}>
              {busy ? t('replyActions.saving') : t('replyActions.save')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setDraft(reply.content);
                setDraftJson(reply.content_json ?? null);
                setEditing(false);
              }}
            >
              {t('replyActions.cancel')}
            </Button>
          </div>
        </div>
      )}

      <div className="px-4 py-3 flex flex-wrap items-center gap-2">
        <LikeButton type="reply" id={reply.id} initialCount={reply.like_count || 0} />
        <ReactionBar targetType="reply" targetId={reply.id} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => quote(postId, reply)}
          className="text-[var(--text-secondary)]"
        >
          <Quote className="w-4 h-4 mr-1" />
          {t('replyActions.quote')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => replyTo(postId, reply)}
          className="text-[var(--text-secondary)]"
        >
          <ReplyIcon className="w-4 h-4 mr-1" />
          {t('replyActions.reply')}
        </Button>

        {canAcceptAnswer && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={toggleBestAnswer}
            className={isBestReply ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}
            data-testid={`reply-accept-${reply.id}`}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            {isBestReply ? t('replyActions.unaccept') : t('replyActions.accept')}
          </Button>
        )}
        {canModify && !editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="text-[var(--text-secondary)]"
            data-testid={`reply-edit-${reply.id}`}
          >
            <Pencil className="w-4 h-4 mr-1" />
            {t('replyActions.edit')}
          </Button>
        )}
        {canModify && (
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={busy}
            className="text-red-600 hover:text-red-700"
            data-testid={`reply-delete-${reply.id}`}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {t('replyActions.delete')}
          </Button>
        )}
        {user != null && user.id !== reply.user_id && (
          <ReportDialog targetType="reply" targetId={reply.id} />
        )}
      </div>
    </div>
  );
}
