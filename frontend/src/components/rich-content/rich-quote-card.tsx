'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Quote } from 'lucide-react';
import { postApi } from '@/lib/api/client';

export function RichQuoteCard({ postId, replyId, editing = false }: { postId: number; replyId?: number; editing?: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setAvailable(null);
    if (editing) return;
    let live = true;
    // ID-only presentation. Never display snapshots of private/deleted content.
    postApi.getQuoteAvailability(postId, replyId).then(() => { if (live) setAvailable(true); }).catch(() => { if (live) setAvailable(false); });
    return () => { live = false; };
  }, [postId, replyId, editing]);
  return <aside className="rich-quote-card" data-testid="rich-quote-card" data-quote-type={replyId ? 'reply' : 'post'} data-post-id={postId} data-reply-id={replyId}>
    <span className="rich-quote-heading"><Quote size={18} aria-hidden="true" />{replyId ? '引用回复' : '引用帖子'} #{replyId || postId}</span>
    <span className="rich-quote-state">{editing ? '发布后会检查访问权限' : available === null ? '正在检查引用权限…' : !available ? '引用的内容不可用' : <Link href={replyId ? `/posts/${postId}#reply-${replyId}` : `/posts/${postId}`}>{replyId ? '查看引用回复' : '打开引用帖子'}</Link>}</span>
  </aside>;
}
