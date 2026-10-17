'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, Heart, MessageCircle } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { useAuth } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';

export default function ResourceCardActions({
  resourceId,
  resourceHref,
  initialLiked = false,
  initialLikeCount = 0,
  commentCount = 0,
}: {
  resourceId: number;
  resourceHref: string;
  initialLiked?: boolean;
  initialLikeCount?: number;
  commentCount?: number;
}) {
  const { isAuthenticated } = useAuth();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [busy, setBusy] = useState(false);

  const toggleLike = async () => {
    if (!isAuthenticated) {
      showSuccess('请先登录后点赞');
      return;
    }
    setBusy(true);
    try {
      const result = liked ? await resourceApi.removeLike(resourceId) : await resourceApi.addLike(resourceId);
      setLiked(result.is_liked);
      setLikeCount(result.like_count);
    } catch (error) {
      showSuccess(error instanceof Error ? error.message : '点赞操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      <button type="button" disabled={busy} onClick={toggleLike} className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 transition ${liked ? 'bg-rose-500/10 text-rose-500' : 'text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-500'}`} aria-label={liked ? '取消点赞' : '点赞'}>
        <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />{likeCount}
      </button>
      <Link href={`${resourceHref}#reviews`} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--primary-text)]" aria-label="查看评论">
        <MessageCircle className="h-3.5 w-3.5" />{commentCount}
      </Link>
      <a href={resourceApi.download(resourceId)} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--primary-text)]" aria-label="下载资源">
        <Download className="h-3.5 w-3.5" />下载
      </a>
    </div>
  );
}
