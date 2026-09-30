'use client';

import { useEffect, useState } from 'react';
import AttachmentList from '@/components/forum/attachment-list';
import { attachmentApi } from '@/lib/api/client';
import type { Attachment } from '@/types';
import { omitEmbeddedAttachments } from '@/lib/tiptap/attachment-projection';

export default function ReplyAttachmentList({ replyId, contentJson }: { replyId: number; contentJson?: unknown }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    attachmentApi.getByReply(replyId).then(setAttachments).catch(() => setAttachments([]));
  }, [replyId]);

  return <AttachmentList attachments={omitEmbeddedAttachments(attachments, contentJson)} />;
}
