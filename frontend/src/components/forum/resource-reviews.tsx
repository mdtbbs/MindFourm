'use client';

import { Resource } from '@/types';
import ResourceCommentThread from './resource-comment-thread';
import { MessageSquare } from 'lucide-react';

interface ResourceReviewsProps {
  resource: Resource;
}

export default function ResourceReviews({ resource }: ResourceReviewsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
        <MessageSquare className="w-5 h-5" />
        用户评价
      </h2>
      <ResourceCommentThread resourceId={resource.id} />
    </div>
  );
}
