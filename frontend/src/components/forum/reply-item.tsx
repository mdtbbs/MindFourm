'use client';

import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Reply, UserRole } from '@/types';
import Button from '@/components/ui/button';
import { Title } from '@/components/shared/Title';
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

  // Map role to Title type
  const roleToTitleType = (role: UserRole): 'active' | 'core' | 'mod' | 'admin' | 'contributor' => {
    switch (role) {
      case 'admin': return 'admin';
      case 'moderator': return 'mod';
      default: return 'active';
    }
  };

  return (
    <div
      id={`reply-${reply.id}`}
      style={{
        display: 'flex',
        gap: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      {/* Mini User Card */}
      <div style={{ width: 100, textAlign: 'center' }}>
        <div
          style={{
            width: 36,
            height: 36,
            background: 'var(--bg-elevated)',
            borderRadius: 6,
            margin: '0 auto 4px',
          }}
        />
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
          #{reply.author_mindauth_id}
        </div>
        <Title type={roleToTitleType(reply.author_role)} size="sm" bordered={false} />
      </div>

      {/* Reply Content */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          #{index + 1} · {formatTime(reply.created_at)}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <MarkdownRenderer content={reply.content} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <Button variant="ghost" size="sm" onClick={handleQuote} disabled={!handleQuote}>
            <Quote style={{ width: 14, height: 14, marginRight: 4 }} />
            引用
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReply} disabled={!handleReply}>
            <ReplyIcon style={{ width: 14, height: 14, marginRight: 4 }} />
            回复
          </Button>
          <span>👍 0</span>
        </div>
      </div>
    </div>
  );
}
