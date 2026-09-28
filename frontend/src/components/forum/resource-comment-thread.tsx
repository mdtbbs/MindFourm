'use client';

import { useState, useEffect, useCallback } from 'react';
import { resourceCommentApi } from '@/lib/api/client';
import type { ResourceComment } from '@/types';
import { useAuth } from '@/store/user-store';
import { Heart, Reply as ReplyIcon, Trash2, Send } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

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
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; username: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const loadComments = useCallback(async () => {
    try {
      const res = await resourceCommentApi.getByResource(resourceId, { page: 1, limit: 100 });
      setComments(res.data || []);
      setPage(1);
      const count = res.pagination?.total ?? 0;
      setTotal(count);
      onCountChange?.(count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [resourceId, onCountChange]);

  const loadMore = async () => {
    const nextPage = page + 1;
    const res = await resourceCommentApi.getByResource(resourceId, { page: nextPage, limit: 100 });
    setComments((current) => [...current, ...(res.data || [])]);
    setPage(nextPage);
  };

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await resourceCommentApi.create(resourceId, {
        content: newComment.trim(),
        parent_comment_id: replyTo?.id,
      });
      setNewComment('');
      setReplyTo(null);
      await loadComments();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('resourceComments.deleteConfirm'))) return;
    try {
      await resourceCommentApi.delete(id);
      await loadComments();
    } catch {
      // silent
    }
  };

  const tree = buildCommentTree(comments);

  if (loading) {
    return <div role="status" className="text-center text-muted-foreground py-8">{t('resourceComments.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* 评论表单 */}
      <div className="card p-4">
        <h3 className="text-lg font-bold mb-3">
          {replyTo ? t('resourceComments.replyTo', { name: replyTo.username }) : t('resourceComments.new')}
        </h3>
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('resourceComments.placeholder')}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          {replyTo && (
            <button
              onClick={() => setReplyTo(null)}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {t('resourceComments.cancel')}
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !newComment.trim()}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {submitting ? t('resourceComments.submitting') : t('resourceComments.submit')}
          </button>
        </div>
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
              onReply={(id, username) => setReplyTo({ id, username })}
              onDelete={handleDelete}
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
  onDelete,
}: {
  node: CommentNode;
  depth: number;
  currentUserId?: number;
  viewerIsStaff: boolean;
  onReply: (id: number, username: string) => void;
  onDelete: (id: number) => void;
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
            <div className="text-sm whitespace-pre-wrap">{node.content}</div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <button className="flex items-center gap-1 hover:text-primary">
                <Heart className="w-3 h-3" />
                {node.upvote_count > 0 && <span>{node.upvote_count}</span>}
              </button>
              <button
                onClick={() => onReply(node.id, node.username || t('resourceComments.anonymous'))}
                className="flex items-center gap-1 hover:text-primary"
              >
                <ReplyIcon className="w-3 h-3" />
                {t('resourceComments.reply')}
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
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
