'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/button';
import { LikeButton } from '@/components/forum/like-button';
import ReportDialog from '@/components/forum/report-dialog';
import ReactionBar from '@/components/forum/reaction-bar';
import { useReplyComposeStore } from '@/store/reply-compose-store';
import { useAuth } from '@/store/user-store';
import { postApi, replyApi } from '@/lib/api/client';
import { useToastStore } from '@/store/toast-store';
import type { Reply } from '@/types';
import { CheckCircle2, Pencil, Quote, Reply as ReplyIcon, Trash2 } from 'lucide-react';

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
  const router = useRouter();
  const quote = useReplyComposeStore((state) => state.quote);
  const replyTo = useReplyComposeStore((state) => state.replyTo);
  const { user } = useAuth();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.content);
  const [busy, setBusy] = useState(false);

  const isStaff = user?.role === 'admin' || user?.role === 'moderator';
  // The API authorises both operations itself; this only decides what to offer.
  const canModify = (user != null && user.id === reply.user_id) || isStaff;

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      showError('回复内容不能为空');
      return;
    }

    setBusy(true);
    try {
      await replyApi.update(reply.id, trimmed);
      showSuccess('回复已更新');
      setEditing(false);
      // The reply body is server-rendered, so the new content only appears after the
      // route re-renders — a local state update would leave the two out of step.
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : '更新失败，请稍后重试');
    }
    setBusy(false);
  };

  const toggleBestAnswer = async () => {
    setBusy(true);
    try {
      // Passing null clears the mark; the API treats it as "no accepted answer".
      await postApi.setBestReply(postId, isBestReply ? null : reply.id);
      showSuccess(isBestReply ? '已取消采纳' : '已采纳为答案');
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm('确定删除这条回复？删除后无法恢复。')) return;

    setBusy(true);
    try {
      await replyApi.delete(reply.id);
      showSuccess('回复已删除');
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : '删除失败，请稍后重试');
    }
    setBusy(false);
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)]">
      {editing && (
        <div className="px-4 pt-3">
          <label htmlFor={`reply-edit-${reply.id}`} className="sr-only">
            编辑回复
          </label>
          <textarea
            id={`reply-edit-${reply.id}`}
            data-testid={`reply-edit-input-${reply.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          />
          <div className="flex items-center gap-2 mt-2 mb-1">
            <Button size="sm" onClick={save} disabled={busy} data-testid={`reply-edit-save-${reply.id}`}>
              {busy ? '保存中…' : '保存'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setDraft(reply.content);
                setEditing(false);
              }}
            >
              取消
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
          引用
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => replyTo(postId, reply)}
          className="text-[var(--text-secondary)]"
        >
          <ReplyIcon className="w-4 h-4 mr-1" />
          回复
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
            {isBestReply ? '取消采纳' : '采纳为答案'}
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
            编辑
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
            删除
          </Button>
        )}
        {user != null && user.id !== reply.user_id && (
          <ReportDialog targetType="reply" targetId={reply.id} />
        )}
      </div>
    </div>
  );
}
