'use client';

import { useEffect, useState } from 'react';
import { replyApi } from '@/lib/api/client';
import { useI18n } from '@/i18n/provider';
import ReplyItem from '@/components/forum/reply-item';
import type { Reply } from '@/types';

/** A reply plus the replies that answer it, nested to arbitrary depth. */
export interface ReplyNode {
  reply: Reply;
  /** 1-based floor number; only root replies carry one. */
  floor: number | null;
  children: ReplyNode[];
}

/**
 * Arrange a flat reply list into threads.
 *
 * The API pages root replies separately from child replies. Expanded branches are
 * merged into this tree without changing the root floor numbering. A child whose parent is absent
 * anyway — deleted mid-request, or deeper than the server expands — is promoted to a
 * root rather than dropped, because silently losing a reply is worse than showing it at
 * the wrong indent.
 */
export function buildReplyTree(replies: Reply[], floorOffset = 0): ReplyNode[] {
  const nodes = new Map<number, ReplyNode>();
  for (const reply of replies) {
    nodes.set(reply.id, { reply, floor: null, children: [] });
  }

  const roots: ReplyNode[] = [];
  for (const reply of replies) {
    const node = nodes.get(reply.id)!;
    const parentId = reply.parent_reply_id;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  roots.forEach((node, index) => {
    node.floor = floorOffset + index + 1;
  });

  return roots;
}

interface ReplyThreadProps {
  nodes: ReplyNode[];
  postId: number;
  /** Whether the viewer may accept an answer on this post — its author, or staff. */
  canAcceptAnswer?: boolean;
  /** The reply currently accepted as the answer, if any. */
  bestReplyId?: number | null;
  postOwnerId?: number;
  depth?: number;
}

/**
 * Render reply threads with indentation.
 *
 * Nesting was the missing half of a feature that already worked everywhere else: the
 * schema has `parent_reply_id`, the API accepts it, and the composer sends it — but the
 * page rendered one flat list, so a reply to a reply looked exactly like a new floor and
 * the conversation it belonged to was invisible.
 */
export default function ReplyThread({
  nodes,
  postId,
  canAcceptAnswer = false,
  bestReplyId = null,
  postOwnerId,
  depth = 0,
}: ReplyThreadProps) {
  if (nodes.length === 0) return null;

  return (
    <div className={depth === 0 ? 'space-y-4' : 'mt-3 space-y-3'}>
      {nodes.map((node) => (
        <ReplyBranch key={node.reply.id} node={node} postId={postId} canAcceptAnswer={canAcceptAnswer}
          bestReplyId={bestReplyId} postOwnerId={postOwnerId} depth={depth} />
      ))}
    </div>
  );
}


function ReplyBranch({ node, postId, canAcceptAnswer, bestReplyId, postOwnerId, depth = 0 }: Omit<ReplyThreadProps, 'nodes'> & { node: ReplyNode }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Reply[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(Boolean(node.reply.child_count));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const onMutation = (event: Event) => {
      const detail = (event as CustomEvent<{ postId: number; type: string; reply?: Reply; replyId?: number }>).detail;
      if (detail?.postId !== postId) return;
      if (detail.type === 'update' && detail.reply) setLoaded(current => current.map(reply => reply.id === detail.reply!.id ? { ...reply, ...detail.reply } : reply));
      if (detail.type === 'delete') setLoaded(current => current.filter(reply => reply.id !== detail.replyId));
    };
    window.addEventListener('mdtbbs:reply-mutation', onMutation);
    return () => window.removeEventListener('mdtbbs:reply-mutation', onMutation);
  }, [postId]);
  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await replyApi.getChildren(postId, node.reply.id, page + 1, 20);
      setLoaded(current => [...new Map([...current, ...result.data].map(reply => [reply.id, reply])).values()]);
      setPage(result.pagination.page);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('replySection.loadFailed'));
    } finally {
      setLoading(false);
    }
  };
  const children = [...new Map([...node.children, ...buildReplyTree(loaded)].map(child => [child.reply.id, child])).values()];
  return (
    <div>
      <ReplyItem reply={node.reply} floor={depth > 0 ? null : node.floor} postId={postId} isNested={depth > 0}
        canAcceptAnswer={canAcceptAnswer} isBestReply={bestReplyId === node.reply.id}
        isOriginalPoster={node.reply.user_id === postOwnerId} />
      {(children.length > 0 || hasMore) && (
        <div className={`border-l-2 border-[var(--border)] pl-3 sm:pl-4 ${depth < 3 ? 'ml-3 sm:ml-6' : 'ml-1 sm:ml-2'}`}>
          <ReplyThread nodes={children} postId={postId} canAcceptAnswer={canAcceptAnswer}
            bestReplyId={bestReplyId} postOwnerId={postOwnerId} depth={depth + 1} />
          {hasMore && (
            <button type="button" disabled={loading} onClick={loadMore}
              className="mt-3 text-sm text-[var(--primary-text)] hover:underline disabled:opacity-50">
              {loading ? t('common.loading') : t('replySection.expandChildren', { count: node.reply.child_count ?? 0 })}
            </button>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
