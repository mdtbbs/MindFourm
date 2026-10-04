'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bug, CheckCircle2, Lightbulb, MessageCircle, Send } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

type FeedbackType = 'bug' | 'suggestion' | 'other';

const feedbackTypes: Array<{ value: FeedbackType; label: string; description: string; icon: typeof Bug }> = [
  { value: 'bug', label: 'bug', description: 'bugDescription', icon: Bug },
  { value: 'suggestion', label: 'suggestion', description: 'suggestionDescription', icon: Lightbulb },
  { value: 'other', label: 'other', description: 'otherDescription', icon: MessageCircle },
];

export default function FeedbackPage() {
  const { t } = useI18n();
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
    if (!title.trim()) errors.title = t('feedback.titleRequired');
    if (!description.trim()) errors.description = t('feedback.descriptionRequired');
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ type, title: title.trim(), description: description.trim(), contact_email: email.trim() || undefined }),
      });
      if (!response.ok) throw new Error(t('feedback.submitFailed'));
      setSubmitted(true);
    } catch {
      setFieldErrors({ form: t('feedback.submitFailed') });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 sm:p-10">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h1 className="mt-5 text-2xl font-bold text-[var(--text)]">{t('feedback.successTitle')}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{t('feedback.successDescription')}</p>
        <div className="mt-6 flex justify-center gap-3"><Link href="/" className="bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">{t('feedback.back')}</Link><button type="button" onClick={() => { setSubmitted(false); setTitle(''); setDescription(''); setEmail(''); }} className="border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]">{t('feedback.submitMore')}</button></div>
      </section>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">{t('feedback.title')}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{t('feedback.description')}</p>
      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7">
        <fieldset><legend className="mb-3 text-sm font-medium text-[var(--text)]">{t('feedback.types')}</legend><div className="grid gap-3 sm:grid-cols-3">{feedbackTypes.map((option) => { const Icon = option.icon; const selected = type === option.value; return <button key={option.value} type="button" onClick={() => setType(option.value)} className={`rounded-xl border p-4 text-left transition ${selected ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]'}`}><Icon className={`h-5 w-5 ${selected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} /><span className="mt-3 block text-sm font-semibold text-[var(--text)]">{t(`feedback.${option.label}`)}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{t(`feedback.${option.description}`)}</span></button>; })}</div></fieldset>
        <div><label htmlFor="feedback-title" className="mb-2 block text-sm font-medium text-[var(--text)]">{t('feedback.titleLabel')} <span className="text-red-500">*</span></label><input id="feedback-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} aria-invalid={Boolean(fieldErrors.title)} placeholder={t('feedback.titlePlaceholder')} className={`w-full rounded-lg border bg-[var(--bg-elevated)] px-4 py-2.5 text-[var(--text)] outline-none focus:border-[var(--primary)] ${fieldErrors.title ? 'border-red-500' : 'border-[var(--border)]'}`} />{fieldErrors.title && <p className="mt-2 text-sm text-red-500">{fieldErrors.title}</p>}</div>
        <div><label htmlFor="feedback-description" className="mb-2 block text-sm font-medium text-[var(--text)]">{t('feedback.descriptionLabel')} <span className="text-red-500">*</span></label><textarea id="feedback-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={7} maxLength={10000} aria-invalid={Boolean(fieldErrors.description)} placeholder={t(`feedback.${type}Placeholder`)} className={`w-full resize-y rounded-lg border bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text)] outline-none focus:border-[var(--primary)] ${fieldErrors.description ? 'border-red-500' : 'border-[var(--border)]'}`} />{fieldErrors.description && <p className="mt-2 text-sm text-red-500">{fieldErrors.description}</p>}</div>
        <div><label htmlFor="feedback-email" className="mb-2 block text-sm font-medium text-[var(--text)]">{t('feedback.emailLabel')} <span className="font-normal text-[var(--text-muted)]">{t('feedback.optional')}</span></label><input id="feedback-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('feedback.emailPlaceholder')} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[var(--text)] outline-none focus:border-[var(--primary)]" /></div>
        {fieldErrors.form && <p className="text-sm text-red-500">{fieldErrors.form}</p>}
        <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-3 text-sm font-medium text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"><Send className="h-4 w-4" />{submitting ? t('feedback.submitting') : t('feedback.submit')}</button>
      </form>
    </div>
  );
}
