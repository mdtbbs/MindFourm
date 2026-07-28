'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { PostSummary } from '@/types';
import Badge from '@/components/ui/badge';
import { LikeButton } from '@/components/forum/like-button';
import { Pin, MessageSquare, Eye, Clock } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

interface PostCardProps {
  post: PostSummary;
}

export default function PostCard({ post }: PostCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      whileHover={{ y: -1 }}
      className={cn(
        'panel-surface p-4 transition-colors duration-200',
        post.status === 'pending'
          ? 'border-l-3 border-l-amber-400 bg-amber-50/40'
          : post.is_pinned ? 'border-[var(--primary-border-strong)]' : 'border-[var(--border)]'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 border-l-2 pl-4 border-[var(--primary-border-soft)]">
          <div className="flex items-center gap-2 mb-1">
            {post.is_pinned && (
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Pin className="w-4 h-4 text-[var(--primary)] shrink-0" />
              </motion.div>
            )}
            {post.status === 'pending' && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 shrink-0">
                <Clock className="w-3 h-3" />
                待审核
              </span>
            )}
            <Link
              href={`/posts/${post.id}`}
              className="text-[15px] font-semibold text-[var(--foreground)] hover:text-[var(--primary)] truncate"
            >
              {post.title}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)]">
            {post.category_name && (
              <Link
                href={`/categories/${post.category_id}`}
                className="rounded-none border border-[var(--border)] px-2 py-0.5 bg-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
              >
                {post.category_name}
              </Link>
            )}

            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
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

            <LikeButton type="post" id={post.id} initialCount={post.like_count || 0} />

            <span>{formatTime(post.created_at)}</span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
