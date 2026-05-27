'use client';

import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Post, UserRole } from '@/types';
import Button from '@/components/ui/button';
import BookmarkButton from '@/components/forum/bookmark-button';
import { Title } from '@/components/shared/Title';
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

  // Map role to Title type
  const roleToTitleType = (role: UserRole): 'active' | 'core' | 'mod' | 'admin' | 'contributor' => {
    switch (role) {
      case 'admin': return 'admin';
      case 'moderator': return 'mod';
      default: return 'active';
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* Author Card */}
      <div
        style={{
          width: 140,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            margin: '0 auto 8px',
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>
          用户 #{post.author_mindauth_id}
        </div>
        <div style={{ marginBottom: 12 }}>
          <Title type={roleToTitleType(post.author_role)} size="sm" />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <div>帖子: <strong style={{ color: 'var(--text)' }}>-</strong></div>
          <div>回复: <strong style={{ color: 'var(--text)' }}>-</strong></div>
        </div>
      </div>

      {/* Main Content */}
      <article style={{ flex: 1, maxWidth: 640 }}>
        {/* Header */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 20,
            marginBottom: 12,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', marginBottom: 12 }}>
            {post.title}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            发布于 {formatTime(post.created_at)} · {post.category_name || '未分类'}
          </div>
          {post.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {post.tags.map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    background: 'var(--bg-elevated)',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <MarkdownRenderer content={post.content} />
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 16,
            padding: '12px 0',
            borderTop: '1px solid var(--border-light)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          {postId && <BookmarkButton postId={postId} />}
          <span>👍 0</span>
          <span>💬 {post.reply_count}</span>
          <span>👁 {post.view_count}</span>
          {canModerate && onPin && (
            <Button variant="ghost" size="sm" onClick={onPin}>
              <Pin style={{ width: 16, height: 16, marginRight: 4 }} />
              {post.is_pinned ? '取消置顶' : '置顶'}
            </Button>
          )}
          {canModerate && onMove && (
            <Button variant="ghost" size="sm" onClick={onMove}>
              <Move style={{ width: 16, height: 16, marginRight: 4 }} />
              移动
            </Button>
          )}
          {canModerate && onDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete} style={{ color: 'var(--error)' }}>
              <Trash2 style={{ width: 16, height: 16, marginRight: 4 }} />
              删除
            </Button>
          )}
        </div>
      </article>
    </div>
  );
}
