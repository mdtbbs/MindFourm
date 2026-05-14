'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Reply } from '@/types';
import { replyApi } from '@/lib/api/client';

const ReplyEditor = dynamic(() => import('@/components/forum/reply-editor'), {
  loading: () => <div className="text-center py-4 text-surface-500">加载编辑器...</div>,
});

interface ReplyFormProps {
  postId: number;
  onReplyCreated?: () => void;
}

export default function ReplyForm({ postId, onReplyCreated }: ReplyFormProps) {
  const [quoteReply, setQuoteReply] = useState<Reply | null>(null);
  const [replyToReply, setReplyToReply] = useState<Reply | null>(null);

  const handleSubmit = async (content: string, parentReplyId?: number) => {
    await replyApi.create(postId, { content, parent_reply_id: parentReplyId });
    setQuoteReply(null);
    setReplyToReply(null);
    onReplyCreated?.();
  };

  return (
    <ReplyEditor
      postId={postId}
      onSubmit={handleSubmit}
      quoteReply={quoteReply}
      replyToReply={replyToReply}
    />
  );
}
