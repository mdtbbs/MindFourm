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
 * The API returns every reply on the page plus all descendants of that page's roots, so
 * a parent is always present for any child in the list. A child whose parent is absent
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
  depth = 0,
}: ReplyThreadProps) {
  if (nodes.length === 0) return null;

  return (
    <div className={depth === 0 ? 'space-y-4' : 'mt-3 space-y-3'}>
      {nodes.map((node) => (
        <div key={node.reply.id}>
          <ReplyItem
            reply={node.reply}
            floor={node.floor}
            postId={postId}
            isNested={depth > 0}
            canAcceptAnswer={canAcceptAnswer}
            isBestReply={bestReplyId === node.reply.id}
          />
          {node.children.length > 0 && (
            // Indentation stops growing past a few levels so deep threads stay readable
            // on narrow screens instead of collapsing into a sliver of text.
            <div
              className={`border-l-2 border-[var(--border)] pl-3 sm:pl-4 ${
                depth < 3 ? 'ml-3 sm:ml-6' : 'ml-1 sm:ml-2'
              }`}
            >
              <ReplyThread
                nodes={node.children}
                postId={postId}
                canAcceptAnswer={canAcceptAnswer}
                bestReplyId={bestReplyId}
                depth={depth + 1}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
