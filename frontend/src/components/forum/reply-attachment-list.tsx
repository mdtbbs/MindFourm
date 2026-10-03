'use client';

import { useUserStore } from '@/store/user-store';
import { useEffect } from 'react';
import AttachmentList from '@/components/forum/attachment-list';
import { useReplyAttachments, useReplyAttachmentStore } from '@/store/reply-attachment-store';
import { omitEmbeddedAttachments } from '@/lib/tiptap/attachment-projection';

export default function ReplyAttachmentList({ replyId, contentJson }: { replyId: number; contentJson?: unknown }) {
  const viewerId = useUserStore((state) => state.user?.id);
  const attachments = useReplyAttachments(replyId);
  const ensure = useReplyAttachmentStore((state) => state.ensure);

  useEffect(() => {
    ensure(replyId);
  }, [replyId, ensure, viewerId]);

  return <AttachmentList attachments={omitEmbeddedAttachments(attachments, contentJson)} />;
}
