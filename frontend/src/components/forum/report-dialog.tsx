'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';
import Button from '@/components/ui/button';
import { REPORT_REASONS, reportApi, type ReportReason, type ReportTargetType } from '@/lib/api/client';
import { useToastStore } from '@/store/toast-store';

interface ReportDialogProps {
  targetType: ReportTargetType;
  targetId: number;
  /** Rendered as the trigger; defaults to a small text button. */
  label?: string;
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
export default function ReportDialog({ targetType, targetId, label = '举报' }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      showSuccess('举报已提交，管理员会尽快处理');
      setDetail('');
      setOpen(false);
      triggerRef.current?.focus();
    } catch (err) {
      // The API already answers with specific, user-facing Chinese ("您已举报过该内容…",
      // "不能举报自己的内容"), so it is shown as-is. Only the phone-verification gate needs
      // rewording, because it surfaces as an opaque `PHONE_NOT_VERIFIED` code.
      const message = err instanceof Error ? err.message : '';
      setError(
        /PHONE_NOT_VERIFIED/i.test(message)
          ? '提交举报需要先完成手机号验证'
          : message || '提交失败，请稍后重试',
      );
    }
    setSubmitting(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`report-trigger-${targetType}-${targetId}`}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--error)] transition-colors"
      >
        <Flag className="w-4 h-4" />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl"
          >
            <div className="flex items-start justify-between mb-4">
              <h2 id="report-dialog-title" className="text-lg font-semibold text-[var(--text)]">
                举报内容
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="关闭"
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <label htmlFor="report-reason" className="block text-sm font-medium text-[var(--text)] mb-2">
              举报原因
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as ReportReason)}
              className="w-full mb-4 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              {REPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <label htmlFor="report-detail" className="block text-sm font-medium text-[var(--text)] mb-2">
              补充说明（可选）
            </label>
            <textarea
              id="report-detail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="补充有助于判断的细节"
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
                取消
              </Button>
              <Button type="button" onClick={submit} disabled={submitting} data-testid="report-submit">
                {submitting ? '提交中…' : '提交举报'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
