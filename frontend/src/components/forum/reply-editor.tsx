'use client';

import { useState, useEffect, useRef } from 'react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Reply } from '@/types';
import Button from '@/components/ui/button';
import { Eye, Edit3 } from 'lucide-react';
import Alert from '@/components/ui/alert';
import { useDraft, useDraftAutoSave } from '@/hooks/use-draft';

interface ReplyEditorProps {
  postId: number;
  onSubmit: (content: string, parentReplyId?: number) => Promise<void>;
  quoteReply?: Reply | null;
  replyToReply?: Reply | null;
  /** Clears the quote / reply-to target without submitting. */
  onCancelTarget?: () => void;
}

export default function ReplyEditor({
  postId,
  onSubmit,
  quoteReply,
  replyToReply,
  onCancelTarget,
}: ReplyEditorProps) {
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const replyId = quoteReply?.id ?? replyToReply?.id;
  const draft = useDraft('reply', replyId ? `r-${replyId}` : `p-${postId}`);
  useDraftAutoSave({ content }, draft.save, !!content);

  // Restore the draft when the editor mounts or switches target (quote/reply-to).
  // Depending on `draft.load` — which is stable per draft key — rather than the
  // whole `draft` object keeps this from re-running on every render and clobbering
  // what the user is typing.
  useEffect(() => {
    const saved = draft.load();
    if (saved?.content) setContent(saved.content as string);
  }, [draft.load]);

  // The composer sits below a paginated reply list, so bring it into view when a
  // quote/reply target is picked — otherwise the buttons look like they did nothing.
  useEffect(() => {
    if (!replyId) return;
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textareaRef.current?.focus();
  }, [replyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        content,
        quoteReply?.id || replyToReply?.id
      );
      setContent('');
      draft.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 overflow-hidden"
    >
      <div className="px-4 py-3 bg-surface-50 dark:bg-gray-800 border-b border-surface-200 dark:border-gray-700">
        <h3 className="font-semibold text-surface-900 dark:text-gray-100">
          {quoteReply ? '引用回复' : replyToReply ? '回复' : '发表回复'}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="p-4">
        {(quoteReply || replyToReply) && (
          <div className="mb-4 flex items-start justify-between gap-3 p-3 bg-surface-50 dark:bg-gray-800 border-l-4 border-primary-500 text-sm text-surface-600 dark:text-gray-300">
            <span>
              {quoteReply ? `引用 #${quoteReply.id} 的内容` : `回复 #${replyToReply!.id}`}
            </span>
            {onCancelTarget && (
              <button
                type="button"
                onClick={onCancelTarget}
                className="shrink-0 text-xs underline hover:text-surface-900 dark:hover:text-gray-100"
              >
                取消
              </button>
            )}
          </div>
        )}

        {error && <Alert type="error" message={error} />}

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
          <MarkdownRenderer content={content} className="min-h-[120px] p-4 bg-surface-50 dark:bg-gray-800 rounded-lg border border-surface-200 dark:border-gray-700" fallback="*暂无内容*" />
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="使用 Markdown 格式编写回复..."
            className="w-full min-h-[120px] px-3 py-2 border border-surface-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y bg-white dark:bg-gray-800 text-surface-900 dark:text-gray-100 placeholder:text-surface-400 dark:placeholder:text-gray-500"
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
