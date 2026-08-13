'use client';

import { useEffect, useState } from 'react';
import AttachmentList from '@/components/forum/attachment-list';
import { attachmentApi } from '@/lib/api/client';
import type { Attachment } from '@/types';

export default function ReplyAttachmentList({ replyId }: { replyId: number }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    attachmentApi.getByReply(replyId).then(setAttachments).catch(() => setAttachments([]));
  }, [replyId]);

  return <AttachmentList attachments={attachments} />;
}
