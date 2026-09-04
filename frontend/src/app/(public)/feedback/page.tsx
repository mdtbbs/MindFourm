'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bug, CheckCircle2, Lightbulb, MessageCircle, Send } from 'lucide-react';

type FeedbackType = 'bug' | 'suggestion' | 'other';

const feedbackTypes: Array<{ value: FeedbackType; label: string; description: string; icon: typeof Bug }> = [
  { value: 'bug', label: 'Bug 报告', description: '功能异常、显示错误或无法完成操作', icon: Bug },
  { value: 'suggestion', label: '功能建议', description: '新功能想法或体验改进建议', icon: Lightbulb },
  { value: 'other', label: '其他反馈', description: '合作、内容或其他想告诉我们的事', icon: MessageCircle },
];

const placeholders: Record<FeedbackType, string> = {
  bug: '请描述：\n• 你进行了什么操作\n• 预期结果是什么\n• 实际发生了什么\n• 使用的设备、系统和浏览器（如有必要）',
  suggestion: '请说明你希望解决的问题、预期的使用方式，以及为什么它对社区有帮助。',
  other: '请尽量提供背景和具体内容，方便我们理解并跟进。',
};

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string; form?: string }>({});

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!title.trim()) errors.title = '请输入反馈标题';
    if (!description.trim()) errors.description = '请填写详细描述';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ type, title: title.trim(), description: description.trim(), contact_email: email.trim() || undefined }),
      });
      if (!response.ok) throw new Error('提交失败');
      setSubmitted(true);
    } catch {
      setFieldErrors({ form: '提交失败，请稍后重试。' });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 sm:p-10">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h1 className="mt-5 text-2xl font-bold text-[var(--text)]">反馈已提交</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">感谢你的反馈。我们会认真阅读并安排处理。</p>
        <div className="mt-6 flex justify-center gap-3"><Link href="/" className="bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">返回论坛</Link><button type="button" onClick={() => { setSubmitted(false); setTitle(''); setDescription(''); setEmail(''); }} className="border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]">继续提交</button></div>
      </section>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Feedback</p>
      <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">意见反馈</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">你的反馈帮助我们改进社区。</p>
      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7">
        <fieldset><legend className="mb-3 text-sm font-medium text-[var(--text)]">反馈类型</legend><div className="grid gap-3 sm:grid-cols-3">{feedbackTypes.map((option) => { const Icon = option.icon; const selected = type === option.value; return <button key={option.value} type="button" onClick={() => setType(option.value)} className={`rounded-xl border p-4 text-left transition ${selected ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]'}`}><Icon className={`h-5 w-5 ${selected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} /><span className="mt-3 block text-sm font-semibold text-[var(--text)]">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{option.description}</span></button>; })}</div></fieldset>
        <div><label htmlFor="feedback-title" className="mb-2 block text-sm font-medium text-[var(--text)]">标题 <span className="text-red-500">*</span></label><input id="feedback-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} aria-invalid={Boolean(fieldErrors.title)} placeholder="简要描述你的反馈" className={`w-full rounded-lg border bg-[var(--bg-elevated)] px-4 py-2.5 text-[var(--text)] outline-none focus:border-[var(--primary)] ${fieldErrors.title ? 'border-red-500' : 'border-[var(--border)]'}`} />{fieldErrors.title && <p className="mt-2 text-sm text-red-500">{fieldErrors.title}</p>}</div>
        <div><label htmlFor="feedback-description" className="mb-2 block text-sm font-medium text-[var(--text)]">详细描述 <span className="text-red-500">*</span></label><textarea id="feedback-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={7} maxLength={10000} aria-invalid={Boolean(fieldErrors.description)} placeholder={placeholders[type]} className={`w-full resize-y rounded-lg border bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text)] outline-none focus:border-[var(--primary)] ${fieldErrors.description ? 'border-red-500' : 'border-[var(--border)]'}`} />{fieldErrors.description && <p className="mt-2 text-sm text-red-500">{fieldErrors.description}</p>}</div>
        <div><label htmlFor="feedback-email" className="mb-2 block text-sm font-medium text-[var(--text)]">联系邮箱 <span className="font-normal text-[var(--text-muted)]">（可选）</span></label><input id="feedback-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="如需回复，留下你的邮箱" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[var(--text)] outline-none focus:border-[var(--primary)]" /></div>
        {fieldErrors.form && <p className="text-sm text-red-500">{fieldErrors.form}</p>}
        <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-3 text-sm font-medium text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"><Send className="h-4 w-4" />{submitting ? '提交中…' : '提交反馈'}</button>
      </form>
    </div>
  );
}
