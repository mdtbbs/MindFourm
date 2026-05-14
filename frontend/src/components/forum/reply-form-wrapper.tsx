'use client';

import ReplyForm from '@/components/forum/reply-form';
import { useRouter } from 'next/navigation';

export default function ReplyFormWrapper({ postId }: { postId: number }) {
  const router = useRouter();

  return (
    <ReplyForm
      postId={postId}
      onReplyCreated={() => router.refresh()}
    />
  );
}
