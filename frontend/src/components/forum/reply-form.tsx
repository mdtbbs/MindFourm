'use client';

import dynamic from 'next/dynamic';
import { replyApi, type CommunityChallengeProof } from '@/lib/api/client';
import {
  useReplyComposeStore,
  useReplyComposeTarget,
} from '@/store/reply-compose-store';
import { useI18n } from '@/i18n/provider';

function ReplyEditorLoading() {
  const { t } = useI18n();
  return <div role="status" className="text-center py-4 text-surface-500">{t('replyEditor.loading')}</div>;
}

const ReplyEditor = dynamic(() => import('@/components/forum/reply-editor'), {
  loading: ReplyEditorLoading,
});

interface ReplyFormProps {
  postId: number;
  onReplyCreated?: (reply: Awaited<ReturnType<typeof replyApi.create>>) => void;
}

export default function ReplyForm({ postId, onReplyCreated }: ReplyFormProps) {
  // Set by the 引用 / 回复 buttons on each reply — see reply-compose-store.
  const { quoteReply, replyToReply } = useReplyComposeTarget(postId);
  const clearComposeTarget = useReplyComposeStore((state) => state.clear);

  const handleSubmit = async (content: string, parentReplyId?: number, contentJson?: Record<string, unknown>, proof?: CommunityChallengeProof) => {
    const reply = await replyApi.create(postId, { content, content_json: contentJson, parent_reply_id: parentReplyId }, proof);
    clearComposeTarget();
    onReplyCreated?.(reply);
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
