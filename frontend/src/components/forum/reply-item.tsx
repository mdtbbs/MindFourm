'use client';

import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Reply } from '@/types';
import Button from '@/components/ui/button';
import { LikeButton } from '@/components/forum/like-button';
import { Quote, Reply as ReplyIcon } from 'lucide-react';

interface ReplyItemProps {
  reply: Reply;
  index: number;
  onQuote?: (reply: Reply) => void;
  onReply?: (reply: Reply) => void;
}

export default function ReplyItem({ reply, index, onQuote, onReply }: ReplyItemProps) {
  const handleQuote = onQuote ? () => onQuote(reply) : undefined;
  const handleReply = onReply ? () => onReply(reply) : undefined;
  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('zh-CN');
  }

  return (
    <div className="bg-[var(--bg-card)] dark:bg-gray-900 rounded-lg border border-[var(--border)] dark:border-gray-700 overflow-hidden" id={`reply-${reply.id}`}>
      {/* Reply Header */}
      <div className="px-4 py-3 bg-[var(--bg-elevated)] dark:bg-gray-800 border-b border-[var(--border)] dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-[var(--text)]">#{index + 1}</span>
          <span className="text-[var(--text-secondary)]">作者 ID: {reply.author_mindauth_id}</span>
          <span className="text-[var(--text-muted)]">|</span>
          <span className="text-[var(--text-secondary)]">{formatTime(reply.created_at)}</span>
        </div>
      </div>

      {/* Reply Content */}
      <div className="p-4">
        <MarkdownRenderer content={reply.content} />
      </div>

      {/* Reply Actions */}
      <div className="px-4 py-3 bg-[var(--bg-elevated)] dark:bg-gray-800 border-t border-[var(--border)] dark:border-gray-700 flex items-center gap-2">
        <LikeButton type="reply" id={reply.id} initialCount={reply.like_count || 0} />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleQuote}
          className="text-[var(--text-secondary)]"
          disabled={!handleQuote}
        >
          <Quote className="w-4 h-4 mr-1" />
          引用
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReply}
          className="text-[var(--text-secondary)]"
          disabled={!handleReply}
        >
          <ReplyIcon className="w-4 h-4 mr-1" />
          回复
        </Button>
      </div>
    </div>
  );
}