'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UserX, X } from 'lucide-react';
import Button from '@/components/ui/button';
import type { UserRole } from '@/types';
import { JsonRequestError } from '@/lib/api/request-json';
import { BLOCK_REASON_MAX_LENGTH, isStaffRole, userBlockApi } from '@/lib/api/user-blocks';
import { useUserStore } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';
import { useI18n } from '@/i18n/provider';

interface BlockUserButtonProps {
  /** The user to block. */
  userId: number;
  username?: string | null;
  /**
   * The target's role, supplied by the caller.
   *
   * Staff cannot be blocked (the API returns 403), so the button hides itself for them
   * rather than offering an action that always fails. The role is never guessed here —
   * a component that fetched it would add a request per rendered author.
   */
  targetRole?: UserRole | null;
  /**
   * Whether the viewer already blocks this user, when the caller knows it.
   *
   * There is no "is this user blocked" endpoint, so callers that do not track it leave
   * this at `false`. That is safe: blocking is idempotent server-side, and an unblock
   * of a user who is not blocked is reconciled from the 404.
   */
  initiallyBlocked?: boolean;
  className?: string;
  /** Notified after a confirmed change, so surrounding lists can update. */
  onChange?: (blocked: boolean) => void;
}

/**
 * Block / unblock entry point, with a confirmation dialog for the blocking direction.
 *
 * The dialog follows ReportDialog: `role="dialog"` with `aria-modal`, Escape to close,
 * Tab trapped inside, focus returned to the trigger, and the body scroll locked while
 * it is open. Unblocking is not confirmed — it is the reversible direction, and a
 * second modal for it would only add friction.
 */
export default function BlockUserButton({
  userId,
  username,
  targetRole,
  initiallyBlocked = false,
  className = '',
  onChange,
}: BlockUserButtonProps) {
  const { t } = useI18n();
  const viewer = useUserStore((state) => state.user);
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);

  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // A caller can re-render with a freshly loaded value; keep local state in step.
  useEffect(() => {
    setBlocked(initiallyBlocked);
  }, [initiallyBlocked]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('textarea, button')?.focus();

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

  // Hidden rather than disabled: none of these viewers can ever perform the action, so
  // there is nothing for a disabled control to explain.
  if (!isAuthenticated || viewer?.id === userId || isStaffRole(targetRole)) return null;

  const displayName = username || t('blockUser.unknownUser', { id: userId });

  const submitBlock = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await userBlockApi.block(userId, reason.trim() || undefined);
      setBlocked(true);
      setReason('');
      setOpen(false);
      triggerRef.current?.focus();
      showSuccess(t('blockUser.blocked', { name: displayName }));
      onChange?.(true);
    } catch (err) {
      // Each status needs a different response from the user, so they must not collapse
      // into one generic failure message.
      if (err instanceof JsonRequestError) {
        if (err.status === 403) {
          setError(t('blockUser.cannotBlockStaff'));
        } else if (err.status === 404) {
          setError(t('blockUser.userMissing'));
        } else if (err.status === 400) {
          setError(err.message || t('blockUser.cannotBlockSelf'));
        } else if (err.status === 401) {
          setError(t('blockUser.sessionExpired'));
        } else {
          setError(err.message || t('blockUser.operationFailed'));
        }
        setSubmitting(false);
        return;
      }
      setError(err instanceof Error ? err.message : t('blockUser.operationFailed'));
    }
    setSubmitting(false);
  };

  const submitUnblock = async () => {
    setSubmitting(true);
    try {
      await userBlockApi.unblock(userId);
      setBlocked(false);
      showSuccess(t('blockUser.unblocked', { name: displayName }));
      onChange?.(false);
    } catch (err) {
      // 404 means the block is already gone — the button was simply out of date, so
      // reconcile instead of reporting a failure the user cannot act on.
      if (err instanceof JsonRequestError && err.status === 404) {
        setBlocked(false);
        onChange?.(false);
      } else {
        showError(err instanceof Error ? err.message : t('blockUser.unblockFailed'));
      }
    }
    setSubmitting(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (blocked ? void submitUnblock() : setOpen(true))}
        disabled={submitting}
        data-testid={`block-user-trigger-${userId}`}
        className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded ${
          blocked
            ? 'text-[var(--text-secondary)] hover:text-[var(--primary-text)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--error)]'
        } ${className}`}
      >
        <UserX className="w-4 h-4" />
        {blocked ? t('blockUser.unblock') : t('blockUser.block')}
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
            aria-labelledby="block-user-dialog-title"
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl"
          >
            <div className="flex items-start justify-between mb-4">
              <h2 id="block-user-dialog-title" className="text-lg font-semibold text-[var(--text)]">
                {t('blockUser.dialogTitle', { name: displayName })}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t('blockUser.close')}
                className="text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('blockUser.description')}
            </p>

            <label htmlFor="block-user-reason" className="block text-sm font-medium text-[var(--text)] mb-2">
              {t('blockUser.reason')}
            </label>
            <textarea
              id="block-user-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={BLOCK_REASON_MAX_LENGTH}
              placeholder={t('blockUser.reasonPlaceholder')}
              className="w-full mb-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            />
            <p className="text-xs text-[var(--text-muted)] mb-4">
              {reason.length} / {BLOCK_REASON_MAX_LENGTH}
            </p>

            {error && (
              <p role="alert" className="text-sm text-[var(--error)] mb-4">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={close} disabled={submitting}>
                {t('blockUser.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void submitBlock()}
                disabled={submitting}
                data-testid="block-user-submit"
              >
                {submitting ? t('blockUser.processing') : t('blockUser.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
