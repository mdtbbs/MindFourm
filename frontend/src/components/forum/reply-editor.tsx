'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reply } from '@/types';
import Button from '@/components/ui/button';
import { Eye, Edit3 } from 'lucide-react';

interface ReplyEditorProps {
  postId: number;
  onSubmit: (content: string, parentReplyId?: number) => Promise<void>;
  quoteReply?: Reply | null;
  replyToReply?: Reply | null;
}

export default function ReplyEditor({
  postId,
  onSubmit,
  quoteReply,
  replyToReply,
}: ReplyEditorProps) {
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(
        content,
        quoteReply?.id || replyToReply?.id
      );
      setContent('');
    } catch (err) {
      console.error('Failed to submit reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
      <div className="px-4 py-3 bg-surface-50 border-b border-surface-200">
        <h3 className="font-semibold text-surface-900">
          {quoteReply ? '引用回复' : replyToReply ? '回复' : '发表回复'}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="p-4">
        {quoteReply && (
          <div className="mb-4 p-3 bg-surface-50 border-l-4 border-primary-500 text-sm text-surface-600">
            引用 #{quoteReply.id} 的内容
          </div>
        )}

        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              !preview ? 'bg-primary-600 text-white' : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Edit3 className="w-4 h-4 inline mr-1" />
            编辑
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              preview ? 'bg-primary-600 text-white' : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Eye className="w-4 h-4 inline mr-1" />
            预览
          </button>
        </div>

        {preview ? (
          <div className="min-h-[120px] p-4 bg-surface-50 rounded-lg border border-surface-200 markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || '*暂无内容*'}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="使用 Markdown 格式编写回复..."
            className="w-full min-h-[120px] px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y"
          />
        )}

        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting || !content.trim()}
          >
            {isSubmitting ? '提交中...' : '提交回复'}
          </Button>
        </div>
      </form>
    </div>
  );
}
