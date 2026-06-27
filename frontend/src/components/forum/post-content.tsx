'use client';

import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Post, UserRole } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import BookmarkButton from '@/components/forum/bookmark-button';
import { Pin, Move, Trash2 } from 'lucide-react';

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
  const canModerate = currentUserRole === 'moderator' || currentUserRole === 'admin';

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('zh-CN');
  }

  return (
    <article className="bg-[var(--bg-card)] dark:bg-gray-900 rounded-lg border border-[var(--border)] dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[var(--border)] dark:border-gray-700">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-3">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text)]">作者</span>
          <span>ID: {post.author_mindauth_id}</span>
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
      <div className="px-6 py-4 bg-[var(--bg-elevated)] dark:bg-gray-800 border-t border-[var(--border)] dark:border-gray-700 flex items-center gap-2">
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
    </article>
  );
}
