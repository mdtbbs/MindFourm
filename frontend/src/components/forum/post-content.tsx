'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { useToast } from '@/lib/toast/context';
import { Post, UserRole } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import BookmarkButton from '@/components/forum/bookmark-button';
import ReportDialog from '@/components/forum/report-dialog';
import ReactionBar from '@/components/forum/reaction-bar';
import AuthorLink from '@/components/forum/author-link';
import { adminApi } from '@/lib/api/client';
import { formatTime } from '@/lib/utils';
import Link from 'next/link';
import { Pin, Move, Trash2, Check, X, Pencil, Lock, Unlock } from 'lucide-react';
import { postApi } from '@/lib/api/client';
import { useI18n } from '@/i18n/provider';

interface PostContentProps {
  post: Post;
  postId?: number;
  currentUserRole?: UserRole | null;
  /** Whether the viewer authored this post, as reported by the API. */
  isOwner?: boolean;
  onPin?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

export default function PostContent({
  post,
  postId,
  currentUserRole,
  isOwner = false,
  onPin,
  onMove,
  onDelete,
}: PostContentProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { showSuccess, showError } = useToast();
  const canModerate = currentUserRole === 'moderator' || currentUserRole === 'admin';
  // The API authorises the write either way; this only decides whether to offer the link.
  const canEdit = isOwner || canModerate;
  const [lockPending, setLockPending] = useState(false);
  const [isLocked, setIsLocked] = useState(Boolean(post.is_locked));

  const handleToggleLock = async () => {
    if (!postId) return;
    setLockPending(true);
    try {
      const next = !isLocked;
      await postApi.setLocked(postId, next);
      setIsLocked(next);
      window.dispatchEvent(new CustomEvent('mdtbbs:post-lock-change', { detail: { postId, isLocked: next } }));
      showSuccess(next ? t('postDetail.lockSuccess') : t('postDetail.unlockSuccess'));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('postDetail.operationFailed'));
    }
    setLockPending(false);
  };

  const [deleting, setDeleting] = useState(false);

  const handleDeleteForOwner = async () => {
    if (!postId || deleting) return;
    if (!window.confirm(t('postDetail.deleteConfirm'))) return;
    setDeleting(true);
    try {
      await postApi.delete(postId);
      showSuccess(t('postDetail.deleted'));
      router.push('/');
    } catch (err) {
      showError(err instanceof Error ? err.message : t('postDetail.deleteFailed'));
      setDeleting(false);
    }
  };
  // Moderation state
  const [modAction, setModAction] = useState<'approving' | 'rejecting' | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Moderation failures surface as a toast rather than relying on a browser reload.
  const handleApprove = async () => {
    if (!postId || modAction) return;
    setModAction('approving');
    try {
      await adminApi.approvePost(postId, 'post');
      router.refresh();
      showSuccess(t('postDetail.approved'));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('postDetail.approveFailed'));
    } finally {
      setModAction(null);
    }
  };

  const handleReject = async () => {
    if (!postId || modAction) return;
    setModAction('rejecting');
    try {
      await adminApi.rejectPost(postId, 'post', rejectReason || undefined);
      router.refresh();
      showSuccess(t('postDetail.rejected'));
      setShowRejectModal(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : t('postDetail.rejectFailed'));
    } finally {
      setModAction(null);
    }
  };

  return (
    <article className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{post.title}</h1>
      </div>
      <div className="mx-5 mt-4 border-t border-[var(--border)] py-3 sm:mx-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AuthorLink
            userId={post.user_id}
            name={post.author_name}
            avatarUrl={post.author_avatar_url}
            role={post.author_role}
            size="md"
            showMeta={false}
            className="max-w-full"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] sm:justify-end">
            <Badge variant="primary">{t('postDetail.originalPoster')}</Badge>
            <span>{t('postDetail.published')} <time dateTime={post.created_at} title={new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.created_at))}>{formatTime(post.created_at, locale)}</time></span>
            <span className="text-[var(--text-muted)]">|</span>
            <span>{t('postDetail.views', { count: new Intl.NumberFormat(locale).format(post.view_count) })}</span>
          {post.edited_at && (
            <>
              <span className="text-[var(--text-muted)]">|</span>
              {/* Only the author and staff may read the history, so only they get a link
                  — but the "edited" marker itself is public: readers deserve to know the
                  text has changed since it was posted. */}
              {canEdit && postId ? (
                <Link
                  href={`/posts/${postId}/revisions`}
                  className="text-[var(--text-secondary)] hover:text-[var(--primary)]"
                >
                  {t('postDetail.edited')} <time dateTime={post.edited_at} title={new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.edited_at))}>{formatTime(post.edited_at, locale)}</time>
                </Link>
              ) : (
                <span>{t('postDetail.edited')} {formatTime(post.edited_at, locale)}</span>
              )}
            </>
          )}

          {isLocked ? (
            <>
              <span className="text-[var(--text-muted)]">|</span>
              <Badge variant="warning">{t('postDetail.locked')}</Badge>
            </>
          ) : null}

          {post.tags?.length > 0 && (
            <>
              <span className="text-[var(--text-muted)]">|</span>
              <div className="flex gap-1">
                {post.tags.map((tag) => (
                  <Badge key={tag.id} variant="primary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[100px] px-5 py-6 text-[16px] leading-8 sm:px-6" data-testid="post-content">
        <MarkdownRenderer content={post.content} className="text-[var(--text)]" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5">
        {/* Moderation actions for pending posts */}
        {post.status === 'pending' && canModerate && (
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mr-1">
              {t('postDetail.pending')}
            </span>
            <button
              onClick={handleApprove}
              disabled={modAction !== null}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {modAction === 'approving' ? t('postDetail.processing') : t('postDetail.approve')}
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={modAction !== null}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {t('postDetail.reject')}
            </button>
          </div>
        )}

        {/* Before the bookmark and moderation controls: reactions belong to the content,
            not to the row of things you can do about it. */}
        {postId && <ReactionBar targetType="post" targetId={postId} />}
        {postId && <BookmarkButton postId={postId} />}
        {postId && canEdit && (
          <Link
            href={`/posts/${postId}/edit`}
            data-testid="post-edit-link"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
          >
            <Pencil className="w-4 h-4" />
            {t('postDetail.edit')}
          </Link>
        )}
        {postId && !isOwner && (
          <ReportDialog targetType="post" targetId={postId} />
        )}
        {canModerate && postId && (
          <Button
            variant="ghost"
            size="sm"
            disabled={lockPending}
            onClick={handleToggleLock}
            className="text-[var(--text-secondary)]"
            data-testid="post-lock-toggle"
          >
            {isLocked ? (
              <>
                <Unlock className="w-4 h-4 mr-1" />
                {t('postDetail.unlock')}
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-1" />
                {t('postDetail.lock')}
              </>
            )}
          </Button>
        )}
        {canModerate && onPin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPin}
            className="text-[var(--text-secondary)]"
          >
            <Pin className="w-4 h-4 mr-1" />
            {post.is_pinned ? t('postDetail.unpin') : t('postDetail.pin')}
          </Button>
        )}
        {canModerate && onMove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMove}
            className="text-[var(--text-secondary)]"
          >
            <Move className="w-4 h-4 mr-1" />
            {t('postDetail.move')}
          </Button>
        )}
        {canModerate && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {t('postDetail.delete')}
          </Button>
        )}
        {isOwner && postId && !canModerate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteForOwner}
            disabled={deleting}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {deleting ? t('postDetail.deleting') : t('postDetail.delete')}
          </Button>
        )}
      </div>

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRejectModal(false)}>
          <div
            className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold text-[var(--text)]">{t('postDetail.rejectReason')}</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('postDetail.rejectReasonOptional')}</p>
            </div>
            <div className="px-6 py-4">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('postDetail.rejectPlaceholder')}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-2">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                {t('postDetail.cancel')}
              </button>
              <button
                onClick={handleReject}
                disabled={modAction === 'rejecting'}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {modAction === 'rejecting' ? t('postDetail.processing') : t('postDetail.confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
