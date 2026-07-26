'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { useToast } from '@/lib/toast/context';
import { Post, UserRole } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import BookmarkButton from '@/components/forum/bookmark-button';
import { adminApi } from '@/lib/api/client';
import { formatTime } from '@/lib/utils';
import { Pin, Move, Trash2, Check, X } from 'lucide-react';

interface PostContentProps {
  post: Post;
  postId?: number;
  currentUserRole?: UserRole | null;
  onPin?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

export default function PostContent({
  post,
  postId,
  currentUserRole,
  onPin,
  onMove,
  onDelete,
}: PostContentProps) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const canModerate = currentUserRole === 'moderator' || currentUserRole === 'admin';
  const authorLabel = post.author_mindauth_id ?? `#${post.user_id}`;

  // Moderation state
  const [modAction, setModAction] = useState<'approving' | 'rejecting' | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // `router.refresh()` re-runs the server components and keeps scroll position and
  // client state; `window.location.reload()` threw both away on every moderation
  // action. Failures now surface as a toast instead of only reaching the console.
  const handleApprove = async () => {
    if (!postId || modAction) return;
    setModAction('approving');
    try {
      await adminApi.approvePost(postId, 'post');
      router.refresh();
      showSuccess('帖子已通过审核');
    } catch (err) {
      showError(err instanceof Error ? err.message : '审核通过失败');
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
      showSuccess('帖子已驳回');
      setShowRejectModal(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : '驳回失败');
    } finally {
      setModAction(null);
    }
  };

  return (
    <article className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[var(--border)]">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-3">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text)]">作者</span>
          <span>ID: {authorLabel}</span>
          <span className="text-[var(--text-muted)]">|</span>
          <span>发布于 {formatTime(post.created_at)}</span>
          <span className="text-[var(--text-muted)]">|</span>
          <span>{post.view_count} 浏览</span>

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

      {/* Content */}
      <div className="p-6" data-testid="post-content">
        <MarkdownRenderer content={post.content} />
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-[var(--bg-elevated)] dark:bg-gray-800 border-t border-[var(--border)] flex items-center gap-2 flex-wrap">
        {/* Moderation actions for pending posts */}
        {post.status === 'pending' && canModerate && (
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mr-1">
              待审核
            </span>
            <button
              onClick={handleApprove}
              disabled={modAction !== null}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {modAction === 'approving' ? '处理中...' : '通过'}
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={modAction !== null}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              拒绝
            </button>
          </div>
        )}

        {postId && <BookmarkButton postId={postId} />}
        {canModerate && onPin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPin}
            className="text-[var(--text-secondary)]"
          >
            <Pin className="w-4 h-4 mr-1" />
            {post.is_pinned ? '取消置顶' : '置顶'}
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
            移动
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
            删除
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
              <h3 className="text-base font-semibold text-[var(--text)]">拒绝原因</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">请填写拒绝此帖子的原因（可选）</p>
            </div>
            <div className="px-6 py-4">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="例如：内容不符合社区规范..."
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
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={modAction === 'rejecting'}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {modAction === 'rejecting' ? '处理中...' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
