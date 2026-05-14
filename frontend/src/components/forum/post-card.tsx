'use client';

import Link from 'next/link';
import { Post } from '@/types';
import Badge from '@/components/ui/badge';
import { Pin, MessageSquare, Eye } from 'lucide-react';

interface PostCardProps {
  post: Post;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function PostCard({ post }: PostCardProps) {
  return (
    <article className="bg-white rounded-lg border border-surface-200 p-4 hover:border-surface-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {post.is_pinned && (
              <Pin className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
            <Link
              href={`/posts/${post.id}`}
              className="text-lg font-semibold text-surface-900 hover:text-primary-600 truncate"
            >
              {post.title}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-surface-500">
            {post.category_name && (
              <Link
                href={`/categories/${post.category_id}`}
                className="hover:text-primary-600 transition-colors"
              >
                {post.category_name}
              </Link>
            )}

            {post.tags && post.tags.length > 0 && (
              <div className="flex gap-1">
                {post.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag.id} variant="primary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              {post.reply_count || 0} 回复
            </span>

            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              {post.view_count} 浏览
            </span>

            <span>{formatTime(post.created_at)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
