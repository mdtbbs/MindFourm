'use client';

import { useState, useEffect, useCallback } from 'react';
import { resourceCommentApi } from '@/lib/api/client';
import type { ResourceComment } from '@/types';
import { MessageSquare, Heart, Reply as ReplyIcon, Edit, Trash2, Send } from 'lucide-react';

interface ResourceCommentThreadProps {
  resourceId: number;
  currentUserId?: number;
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
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export default function ResourceCommentThread({ resourceId, currentUserId }: ResourceCommentThreadProps) {
  const [comments, setComments] = useState<ResourceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; username: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const res = await resourceCommentApi.getByResource(resourceId, { limit: 100 });
      setComments(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

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
    if (!confirm('确定要删除这条评论吗？')) return;
    try {
      await resourceCommentApi.delete(id);
      await loadComments();
    } catch {
      // silent
    }
  };

  const tree = buildCommentTree(comments);

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">加载评论中…</div>;
  }

  return (
    <div className="space-y-6">
      {/* 评论表单 */}
      <div className="card p-4">
        <h3 className="text-lg font-bold mb-3">
          {replyTo ? `回复 ${replyTo.username}` : '发表评论'}
        </h3>
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="写下你的评论…"
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
              取消
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !newComment.trim()}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {submitting ? '提交中…' : '发表'}
          </button>
        </div>
      </div>

      {/* 评论列表 */}
      {tree.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          还没有评论，成为第一个评论的人吧！
        </div>
      ) : (
        <div className="space-y-4">
          {tree.map((node) => (
            <CommentNode
              key={node.id}
              node={node}
              depth={0}
              currentUserId={currentUserId}
              onReply={(id, username) => setReplyTo({ id, username })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentNode({
  node,
  depth,
  currentUserId,
  onReply,
  onDelete,
}: {
  node: CommentNode;
  depth: number;
  currentUserId?: number;
  onReply: (id: number, username: string) => void;
  onDelete: (id: number) => void;
}) {
  const canEdit = currentUserId === node.user_id;
  const canDelete = currentUserId === node.user_id;

  return (
    <div className={depth > 0 ? 'ml-8 border-l-2 border-border pl-4' : ''}>
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {(node.username || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{node.username || '匿名'}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(node.created_at).toLocaleString()}
              </span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{node.content}</div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <button className="flex items-center gap-1 hover:text-primary">
                <Heart className="w-3 h-3" />
                {node.upvote_count > 0 && <span>{node.upvote_count}</span>}
              </button>
              <button
                onClick={() => onReply(node.id, node.username || '匿名')}
                className="flex items-center gap-1 hover:text-primary"
              >
                <ReplyIcon className="w-3 h-3" />
                回复
              </button>
              {canDelete && (
                <button
                  onClick={() => onDelete(node.id)}
                  className="flex items-center gap-1 hover:text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                  删除
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
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
