'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { messageApi } from '@/lib/api/client';
import { Message, Conversation } from '@/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import Button from '@/components/ui/button';
import { ArrowLeft, Send } from 'lucide-react';

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const userId = parseInt((params?.userId as string) || '0');
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ username: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages
  useEffect(() => {
    let cancelled = false;
    messageApi.getConversation(userId)
      .then((res) => {
        if (!cancelled) setMessages(res.data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const msg = await messageApi.send(userId, content);
      setMessages((prev) => [...prev, msg]);
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-surface-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-surface-900 dark:text-gray-100">私信</h1>
      </div>

      {/* Messages */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4 mb-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-center text-surface-400 dark:text-gray-500 py-8">开始一段对话</p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isMine = msg.sender_id !== userId;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-4 py-2 ${
                    isMine
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-100 dark:bg-gray-800 text-surface-900 dark:text-gray-100'
                  }`}>
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
        )}
      </div>

      {/* Error */}
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入消息..."
          className="flex-1 px-3 py-2 border border-surface-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none bg-white dark:bg-gray-800 text-surface-900 dark:text-gray-100"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <Button type="submit" disabled={isSubmitting || !content.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
