'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reply } from '@/types';
import ReplyEditor from '@/components/forum/reply-editor';
import { replyApi } from '@/lib/api/client';

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
