'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { resourceCommentApi } from '@/lib/api/client';
import type { ResourceComment } from '@/types';
import { useAuth } from '@/store/user-store';
import { Heart, Reply as ReplyIcon, Trash2, Quote } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { confirmDialog } from '@/store/interaction-dialog-store';
import Link from 'next/link';
import RichContentRenderer from '@/components/ui/rich-content-renderer';
import { likeApi } from '@/lib/api/client';
import type { CommunityChallengeProof } from '@/lib/api/client';

const ReplyEditor = dynamic(() => import('@/components/forum/reply-editor'), { ssr: false });

interface ResourceCommentThreadProps {
  resourceId: number;
  currentUserId?: number;
  onCountChange?: (count: number) => void;
}

interface CommentNode extends ResourceComment {
  children?: CommentNode[];
}

function buildCommentTree(comments: ResourceComment[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];

  // First pass: create nodes
  for (const c of comments) {
    map.set(c.id, { ...c, children: [] });
  }

  // Second pass: build tree
  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children!.push(node);
    } else if (!c.parent_id) {
      roots.push(node);
    }
  }

  return roots;
}

export default function ResourceCommentThread({ resourceId, currentUserId, onCountChange }: ResourceCommentThreadProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const viewerId = currentUserId ?? user?.id;
  const viewerIsStaff = user?.role === 'admin' || user?.role === 'moderator';
  const [comments, setComments] = useState<ResourceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<{ comment: ResourceComment; mode: 'reply' | 'quote' } | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [discussionUrl, setDiscussionUrl] = useState<string | null>(null);
  const [discussionThreadId, setDiscussionThreadId] = useState<number | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const res = await resourceCommentApi.getByResource(resourceId, { page: 1, limit: 100 });
      const rows = res.data || [];
      let likedById: Record<number, { liked: boolean; count: number }> = {};
      if (user?.id && rows.length) {
        try { likedById = await likeApi.checkBatch('reply', rows.map(({ id }) => id)); } catch { /* The compact thread remains readable if like status is unavailable. */ }
      }
      setComments(rows.map((comment) => ({ ...comment, is_liked: likedById[comment.id]?.liked || false, upvote_count: likedById[comment.id]?.count ?? comment.upvote_count })));
      setDiscussionUrl(res.discussion_thread_url || null);
      setDiscussionThreadId(res.discussion_thread_id || null);
      setPage(1);
      const count = res.pagination?.total ?? 0;
      setTotal(count);
      onCountChange?.(count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [resourceId, onCountChange, user?.id]);

  const loadMore = async () => {
    const nextPage = page + 1;
    const res = await resourceCommentApi.getByResource(resourceId, { page: nextPage, limit: 100 });
    const rows = res.data || [];
    let likedById: Record<number, { liked: boolean; count: number }> = {};
    if (user?.id && rows.length) {
      try { likedById = await likeApi.checkBatch('reply', rows.map(({ id }) => id)); } catch { /* Keep the rows visible. */ }
    }
    setComments((current) => [...current, ...rows.map((comment) => ({ ...comment, is_liked: likedById[comment.id]?.liked || false, upvote_count: likedById[comment.id]?.count ?? comment.upvote_count }))]);
    setPage(nextPage);
  };

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async (
    content: string,
    parentReplyId?: number,
    contentJson?: Record<string, unknown>,
    proof?: CommunityChallengeProof,
  ) => {
    await resourceCommentApi.create(resourceId, {
      content,
      content_json: contentJson,
      content_schema_version: contentJson ? 2 : undefined,
      parent_comment_id: parentReplyId,
    }, proof);
    setReplyTarget(null);
    await loadComments();
  };

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({ message: t('resourceComments.deleteConfirm'), destructive: true })) return;
    try {
      await resourceCommentApi.delete(id);
      await loadComments();
    } catch {
      // silent
    }
  };

  const handleLike = async (comment: ResourceComment) => {
    if (!viewerId) return;
    const wasLiked = Boolean(comment.is_liked);
    setComments((current) => current.map((row) => row.id === comment.id
      ? { ...row, is_liked: !wasLiked, upvote_count: Math.max(0, row.upvote_count + (wasLiked ? -1 : 1)) }
      : row));
    try {
      if (wasLiked) await likeApi.unlikeReply(comment.id);
      else await likeApi.likeReply(comment.id);
    } catch {
      setComments((current) => current.map((row) => row.id === comment.id
        ? { ...row, is_liked: wasLiked, upvote_count: Math.max(0, row.upvote_count + (wasLiked ? 1 : -1)) }
        : row));
    }
  };

  const tree = buildCommentTree(comments);

  if (loading) {
    return <div role="status" className="text-center text-muted-foreground py-8">{t('resourceComments.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      {discussionUrl && <div className="flex justify-end"><Link href={discussionUrl} className="text-sm font-medium text-primary hover:underline">{t('resourceComments.fullDiscussion')}</Link></div>}
      <div className="card p-3 sm:p-4">
        {discussionThreadId && <ReplyEditor
          key={`${discussionThreadId}:${replyTarget?.mode || 'new'}:${replyTarget?.comment.id || ''}`}
          postId={discussionThreadId}
          onSubmit={handleSubmit}
          quoteReply={replyTarget?.mode === 'quote' ? { id: replyTarget.comment.id } : null}
          replyToReply={replyTarget?.mode === 'reply' ? { id: replyTarget.comment.id } : null}
          replyToLabel={replyTarget?.mode === 'reply' ? t('resourceComments.replyTo', { name: replyTarget.comment.username || t('resourceComments.anonymous') }) : undefined}
          onCancelTarget={() => setReplyTarget(null)}
        />}
      </div>

      {/* 评论列表 */}
      {tree.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          {t('resourceComments.empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {tree.map((node) => (
            <CommentNode
              key={node.id}
              node={node}
              depth={0}
              currentUserId={viewerId}
              viewerIsStaff={viewerIsStaff}
              onReply={(comment, mode) => setReplyTarget({ comment, mode })}
              onQuote={(comment) => setReplyTarget({ comment, mode: 'quote' })}
              onDelete={handleDelete}
              onLike={handleLike}
            />
          ))}
        </div>
      )}
      {comments.length < total && <button type="button" onClick={loadMore} className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">{t('resourceComments.loadMore', { shown: comments.length, total })}</button>}
    </div>
  );
}

function CommentNode({
  node,
  depth,
  currentUserId,
  viewerIsStaff,
  onReply,
  onQuote,
  onDelete,
  onLike,
}: {
  node: CommentNode;
  depth: number;
  currentUserId?: number;
  viewerIsStaff: boolean;
  onReply: (comment: ResourceComment, mode: 'reply' | 'quote') => void;
  onQuote: (comment: ResourceComment) => void;
  onDelete: (id: number) => void;
  onLike: (comment: ResourceComment) => void;
}) {
  const { locale, t } = useI18n();
  const canDelete = viewerIsStaff || currentUserId === node.user_id;

  return (
    <div className={depth > 0 ? 'ml-8 border-l-2 border-border pl-4' : ''}>
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {(node.username || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{node.username || t('resourceComments.anonymous')}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(node.created_at).toLocaleString(({ en: 'en', ru: 'ru', ja: 'ja-JP', 'zh-CN': 'zh-CN' } as const)[locale])}
              </span>
            </div>
            <div className="text-sm"><RichContentRenderer json={node.content_json} markdownFallback={node.content} /></div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <button type="button" onClick={() => onLike(node)} disabled={!currentUserId} aria-pressed={Boolean(node.is_liked)} className={`flex items-center gap-1 hover:text-primary disabled:opacity-50 ${node.is_liked ? 'text-primary' : ''}`}>
                <Heart className="w-3 h-3" />
                {node.upvote_count > 0 && <span>{node.upvote_count}</span>}
              </button>
              <button
                onClick={() => onReply(node, 'reply')}
                className="flex items-center gap-1 hover:text-primary"
              >
                <ReplyIcon className="w-3 h-3" />
                {t('resourceComments.reply')}
              </button>
              <button type="button" onClick={() => onQuote(node)} className="flex items-center gap-1 hover:text-primary">
                <Quote className="w-3 h-3" />
                {t('replyEditor.quoteTitle')}
              </button>
              {canDelete && (
                <button
                  onClick={() => onDelete(node.id)}
                  className="flex items-center gap-1 hover:text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('resourceComments.delete')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 子评论 */}
      {node.children && node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <CommentNode
              key={child.id}
              node={child}
              depth={depth + 1}
              currentUserId={currentUserId}
              viewerIsStaff={viewerIsStaff}
              onReply={onReply}
              onQuote={onQuote}
              onDelete={onDelete}
              onLike={onLike}
            />
          ))}
        </div>
      )}
    </div>
  );
}
