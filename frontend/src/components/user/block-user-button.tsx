'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UserX, X } from 'lucide-react';
import Button from '@/components/ui/button';
import type { UserRole } from '@/types';
import { JsonRequestError } from '@/lib/api/request-json';
import { BLOCK_REASON_MAX_LENGTH, isStaffRole, userBlockApi } from '@/lib/api/user-blocks';
import { useUserStore } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';

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

  const displayName = username || `用户 #${userId}`;

  const submitBlock = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await userBlockApi.block(userId, reason.trim() || undefined);
      setBlocked(true);
      setReason('');
      setOpen(false);
      triggerRef.current?.focus();
      showSuccess(`已拉黑 ${displayName}`);
      onChange?.(true);
    } catch (err) {
      // Each status needs a different response from the user, so they must not collapse
      // into one generic failure message.
      if (err instanceof JsonRequestError) {
        if (err.status === 403) {
          setError('不能拉黑管理员或版主');
        } else if (err.status === 404) {
          setError('该用户不存在或已注销');
        } else if (err.status === 400) {
          setError(err.message || '不能拉黑自己');
        } else if (err.status === 401) {
          setError('登录状态已过期，请重新登录后再试');
        } else {
          setError(err.message || '操作失败，请稍后重试');
        }
        setSubmitting(false);
        return;
      }
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    }
    setSubmitting(false);
  };

  const submitUnblock = async () => {
    setSubmitting(true);
    try {
      await userBlockApi.unblock(userId);
      setBlocked(false);
      showSuccess(`已取消拉黑 ${displayName}`);
      onChange?.(false);
    } catch (err) {
      // 404 means the block is already gone — the button was simply out of date, so
      // reconcile instead of reporting a failure the user cannot act on.
      if (err instanceof JsonRequestError && err.status === 404) {
        setBlocked(false);
        onChange?.(false);
      } else {
        showError(err instanceof Error ? err.message : '取消拉黑失败，请稍后重试');
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
            ? 'text-[var(--text-secondary)] hover:text-[var(--primary)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--error)]'
        } ${className}`}
      >
        <UserX className="w-4 h-4" />
        {blocked ? '取消拉黑' : '拉黑'}
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
                拉黑 {displayName}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="关闭"
                className="text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-[var(--text-secondary)] mb-4">
              拉黑后对方将无法向你发送私信。你可以随时在「设置 → 拉黑列表」中取消。
            </p>

            <label htmlFor="block-user-reason" className="block text-sm font-medium text-[var(--text)] mb-2">
              原因（可选，仅自己可见）
            </label>
            <textarea
              id="block-user-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={BLOCK_REASON_MAX_LENGTH}
              placeholder="方便日后回顾为什么拉黑"
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
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void submitBlock()}
                disabled={submitting}
                data-testid="block-user-submit"
              >
                {submitting ? '处理中…' : '确认拉黑'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
