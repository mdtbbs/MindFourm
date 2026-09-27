'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';
import Button from '@/components/ui/button';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionTokens } from '@/lib/motion';
import { REPORT_REASONS, reportApi, type ReportReason, type ReportTargetType } from '@/lib/api/client';
import { useToastStore } from '@/store/toast-store';
import { useI18n } from '@/i18n/provider';

interface ReportDialogProps {
  targetType: ReportTargetType;
  targetId: number;
  /** Rendered as the trigger; defaults to a small text button. */
  label?: string;
  triggerRole?: 'menuitem';
}

/**
 * Report a post, reply, resource or user.
 *
 * Built keyboard-accessible from the start, unlike the overlays already in the app: it
 * has `role="dialog"` with `aria-modal`, closes on Escape, traps Tab inside itself, and
 * returns focus to the trigger on close. The existing reject modal and notification
 * dropdown do none of that — the dropdown even declares `role="menu"` without
 * implementing any of the keyboard behaviour that role promises.
 */
export default function ReportDialog({ targetType, targetId, label, triggerRole }: ReportDialogProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const showSuccess = useToastStore((state) => state.showSuccess);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('select, textarea, button')?.focus();

    // Body scroll lock: without it the page behind a fixed overlay still scrolls, which
    // on touch devices makes the dialog feel detached from the content it is about.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, select, textarea, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await reportApi.create({ target_type: targetType, target_id: targetId, reason, detail: detail.trim() || undefined });
      showSuccess(t('report.submitted'));
      setDetail('');
      setOpen(false);
      triggerRef.current?.focus();
    } catch (err) {
      // The API already answers with specific, user-facing Chinese ("您已举报过该内容…",
      // "不能举报自己的内容"), so it is shown as-is. Only the phone-verification gate needs
      // rewording, because it surfaces as an opaque `PHONE_NOT_VERIFIED` code.
      const message = err instanceof Error ? err.message : '';
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code || '') : '';
      setError(
        code === 'PHONE_NOT_VERIFIED'
          ? t('errors.PHONE_NOT_VERIFIED')
          : message || t('report.submitFailed'),
      );
    }
    setSubmitting(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role={triggerRole}
        onClick={() => setOpen(true)}
        data-testid={`report-trigger-${targetType}-${targetId}`}
        className={`inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--error)] ${triggerRole ? 'min-h-11 w-full rounded px-3 py-2 text-left hover:bg-[var(--bg-hover)]' : 'px-3 py-1.5'}`}
      >
        <Flag className="w-4 h-4" />
        {label || t('report.trigger')}
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : motionTokens.normal }}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.985, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 4 }}
            transition={{ duration: reduceMotion ? 0 : motionTokens.normal, ease: motionTokens.easing }}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 id="report-dialog-title" className="text-lg font-semibold text-[var(--text)]">
                {t('report.title')}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t('report.close')}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <label htmlFor="report-reason" className="block text-sm font-medium text-[var(--text)] mb-2">
              {t('report.reason')}
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as ReportReason)}
              className="w-full mb-4 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              {REPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(`report.reasons.${item.value}`)}
                </option>
              ))}
            </select>

            <label htmlFor="report-detail" className="block text-sm font-medium text-[var(--text)] mb-2">
              {t('report.detail')}
            </label>
            <textarea
              id="report-detail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder={t('report.placeholder')}
              className="w-full mb-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            />
            <p className="text-xs text-[var(--text-muted)] mb-4">{detail.length} / 1000</p>

            {error && (
              <p role="alert" className="text-sm text-[var(--error)] mb-4">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={close} disabled={submitting}>
                {t('report.cancel')}
              </Button>
              <Button type="button" onClick={submit} disabled={submitting} data-testid="report-submit">
                {submitting ? t('report.submitting') : t('report.submit')}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
