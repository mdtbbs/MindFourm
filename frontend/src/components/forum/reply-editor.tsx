'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Reply } from '@/types';
import Button from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Alert from '@/components/ui/alert';
import { useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import { useToastStore } from '@/store/toast-store';

// TipTap editor is client-only
const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => (
    <div className="w-full min-h-[120px] flex items-center justify-center border border-surface-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
      <Loader2 className="w-4 h-4 animate-spin text-surface-400" />
      <span className="ml-2 text-xs text-surface-400">加载编辑器…</span>
    </div>
  ),
});

interface ReplyEditorProps {
  postId: number;
  onSubmit: (content: string, parentReplyId?: number) => Promise<Reply | void>;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const showSuccess = useToastStore((state) => state.showSuccess);

  const replyId = quoteReply?.id ?? replyToReply?.id;
  const draft = useDraft('reply', replyId ? `r-${replyId}` : `p-${postId}`);
  const loadDraft = draft.load;
  useDraftAutoSave({ content }, draft.save, !!content);

  // Restore the draft when the editor mounts or switches target (quote/reply-to).
  useEffect(() => {
    const saved = loadDraft();
    if (saved?.content) setContent(saved.content as string);
  }, [loadDraft]);

  // The composer sits below a paginated reply list, so bring it into view when a
  // quote/reply target is picked — otherwise the buttons look like they did nothing.
  useEffect(() => {
    if (!replyId) return;
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [replyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const reply = await onSubmit(
        content,
        quoteReply?.id || replyToReply?.id
      );
      setContent('');
      draft.clear();
      const msg = reply?.status === 'pending' ? '回复已提交，等待管理员审核' : '回复发布成功！';
      setSuccess(msg);
      showSuccess(msg);
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
        {success && <Alert type="success" message={success} className="mt-3" />}

        <TiptapEditor
          value={content}
          onChange={setContent}
          placeholder="使用富文本编辑器编写回复，支持粘贴 / 拖放上传图片..."
          minHeight="120px"
          compact
          imageUpload
        />

        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting || !content.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                提交中...
              </>
            ) : '提交回复'}
          </Button>
        </div>
      </form>
    </div>
  );
}
