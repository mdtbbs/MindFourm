'use client';

import ReplyForm from '@/components/forum/reply-form';
import { useRouter } from 'next/navigation';

export default function ReplyFormWrapper({ postId }: { postId: number }) {
  const router = useRouter();

  return (
    <ReplyForm
      postId={postId}
      onReplyCreated={(reply) => {
        if (reply.status === 'published') {
          router.refresh();
        }
      }}
    />
  );
}
