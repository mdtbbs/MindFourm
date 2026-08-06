'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { messageApi } from '@/lib/api/client';
import { Message } from '@/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import Button from '@/components/ui/button';
import EmptyState from '@/components/ui/empty-state';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import Skeleton from '@/components/ui/skeleton';
import { ArrowLeft, Send } from 'lucide-react';

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const userId = parseInt((params?.userId as string) || '0', 10);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const response = await messageApi.getConversation(userId);
      setMessages(response.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '对话加载失败，请稍后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsSubmitting(true);
    setSendError(null);
    try {
      const msg = await messageApi.send(userId, content);
      setMessages((prev) => [...prev, msg]);
      setContent('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : '发送失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const conversationState = loading ? (
    <div className="space-y-3" aria-label="正在加载对话">
      {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-3/4" />)}
    </div>
  ) : loadError && messages.length === 0 ? (
    <ErrorState title="对话加载失败" description={loadError} onRetry={() => void loadMessages()} />
  ) : messages.length === 0 ? (
    <EmptyState title="开始一段对话" description="发送一条消息，开始与对方交流。" />
  ) : (
    <div className="space-y-4">
      {messages.map((msg) => {
        const isMine = msg.sender_id !== userId;
        return (
          <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-lg px-4 py-2 ${isMine ? 'bg-primary-600 text-white' : 'bg-surface-100 dark:bg-gray-800 text-surface-900 dark:text-gray-100'}`}>
              <MarkdownRenderer content={msg.content} className="text-sm" />
              <p className={`text-xs mt-1 ${isMine ? 'text-primary-200' : 'text-surface-400 dark:text-gray-500'}`}>
                {new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-surface-100 dark:hover:bg-gray-800 rounded-lg transition-colors" aria-label="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-surface-900 dark:text-gray-100">私信</h1>
        {refreshing && <InlineLoading label="正在刷新" className="min-h-0 py-0" />}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4 mb-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
        {conversationState}
      </div>

      {loadError && messages.length > 0 && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadMessages(true)} className="font-medium underline">重试</button>
        </div>
      )}
      {sendError && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <span>{sendError}</span>
          <button type="button" onClick={() => setSendError(null)} className="font-medium underline">关闭</button>
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="输入消息..." className="flex-1 px-3 py-2 border border-surface-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none bg-white dark:bg-gray-800 text-surface-900 dark:text-gray-100" rows={2} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(e); } }} />
        <Button type="submit" disabled={isSubmitting || !content.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
