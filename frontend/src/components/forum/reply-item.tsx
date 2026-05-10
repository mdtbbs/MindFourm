'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reply } from '@/types';
import Button from '@/components/ui/button';
import { Quote, Reply as ReplyIcon } from 'lucide-react';

interface ReplyItemProps {
  reply: Reply;
  index: number;
  onQuote: (reply: Reply) => void;
  onReply: (reply: Reply) => void;
}

export default function ReplyItem({ reply, index, onQuote, onReply }: ReplyItemProps) {
  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('zh-CN');
  }

  return (
    <div className="bg-white rounded-lg border border-surface-200 overflow-hidden" id={`reply-${reply.id}`}>
      {/* Reply Header */}
      <div className="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-surface-700">#{index + 1}</span>
          <span className="text-surface-500">作者 ID: {reply.author_mindauth_id}</span>
          <span className="text-surface-300">|</span>
          <span className="text-surface-500">{formatTime(reply.created_at)}</span>
        </div>
      </div>

      {/* Reply Content */}
      <div className="p-4">
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {reply.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Reply Actions */}
      <div className="px-4 py-2 bg-surface-50 border-t border-surface-200 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onQuote(reply)}
          className="text-surface-600"
        >
          <Quote className="w-4 h-4 mr-1" />
          引用
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onReply(reply)}
          className="text-surface-600"
        >
          <ReplyIcon className="w-4 h-4 mr-1" />
          回复
        </Button>
      </div>
    </div>
  );
}
