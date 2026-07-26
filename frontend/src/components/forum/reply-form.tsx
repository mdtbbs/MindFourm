'use client';

import dynamic from 'next/dynamic';
import { replyApi } from '@/lib/api/client';
import {
  useReplyComposeStore,
  useReplyComposeTarget,
} from '@/store/reply-compose-store';

const ReplyEditor = dynamic(() => import('@/components/forum/reply-editor'), {
  loading: () => <div className="text-center py-4 text-surface-500">加载编辑器...</div>,
});

interface ReplyFormProps {
  postId: number;
  onReplyCreated?: () => void;
}

export default function ReplyForm({ postId, onReplyCreated }: ReplyFormProps) {
  // Set by the 引用 / 回复 buttons on each reply — see reply-compose-store.
  const { quoteReply, replyToReply } = useReplyComposeTarget(postId);
  const clearComposeTarget = useReplyComposeStore((state) => state.clear);

  const handleSubmit = async (content: string, parentReplyId?: number) => {
    await replyApi.create(postId, { content, parent_reply_id: parentReplyId });
    clearComposeTarget();
    onReplyCreated?.();
  };

  return (
    <ReplyEditor
      postId={postId}
      onSubmit={handleSubmit}
      quoteReply={quoteReply}
      replyToReply={replyToReply}
      onCancelTarget={clearComposeTarget}
    />
  );
}
