'use client';

import { useState } from 'react';

export default function FeedbackPage() {
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type,
          title,
          description,
          contact_email: email || undefined,
        }),
      });

      if (!res.ok) throw new Error('提交失败');
      setSubmitted(true);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-8">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">感谢你的反馈</h2>
          <p className="text-[var(--text-muted)]">我们会认真查看每一条反馈</p>
          <button
            onClick={() => {
              setSubmitted(false);
              setTitle('');
              setDescription('');
              setEmail('');
            }}
            className="mt-6 text-sm text-[var(--primary)] hover:underline"
          >
            继续提交
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold mb-2">意见反馈</h1>
      <p className="text-[var(--text-muted)] mb-8">你的反馈帮助我们改进社区</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">类型</label>
          <div className="flex gap-3">
            {[
              { value: 'bug', label: 'Bug 报告' },
              { value: 'suggestion', label: '功能建议' },
              { value: 'other', label: '其他' },
            ].map(opt => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                  type === opt.value
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] hover:border-[var(--primary)]'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={opt.value}
                  checked={type === opt.value}
                  onChange={() => setType(opt.value)}
                  className="sr-only"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">标题</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            maxLength={255}
            placeholder="简要描述你的反馈"
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">详细描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
            rows={5}
            maxLength={10000}
            placeholder="请详细描述你遇到的问题或建议..."
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none resize-none"
          />
        </div>

        {/* Email (optional) */}
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">
            联系邮箱（可选）
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="如需回复，留下你的邮箱"
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? '提交中...' : '提交反馈'}
        </button>
      </form>
    </div>
  );
}
