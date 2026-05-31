'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Post } from '@/types';
import Badge from '@/components/ui/badge';
import { LikeButton } from '@/components/forum/like-button';
import { Pin, MessageSquare, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{
        scale: 1.01,
        boxShadow: '0 4px 12px rgba(255,107,53,0.1)',
      }}
      className={cn(
        'bg-white dark:bg-gray-900 rounded-lg border p-4',
        post.is_pinned
          ? 'border-red-200 dark:border-red-800/50'
          : 'border-surface-200 dark:border-gray-700'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {post.is_pinned && (
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, 0],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Pin className="w-4 h-4 text-red-500 flex-shrink-0" />
              </motion.div>
            )}
            <Link
              href={`/posts/${post.id}`}
              className="text-lg font-semibold text-surface-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 truncate"
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
                  <motion.div
                    key={tag.id}
                    whileHover={{ scale: 1.05 }}
                  >
                    <Badge variant="primary">
                      {tag.name}
                    </Badge>
                  </motion.div>
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

            <LikeButton type="post" id={post.id} initialCount={post.like_count || 0} />

            <span>{formatTime(post.created_at)}</span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
