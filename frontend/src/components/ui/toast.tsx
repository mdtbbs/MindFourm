'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
  duration?: number;
  dismissible?: boolean;
}

const typeStyles: Record<ToastType, string> = {
  success:
    'bg-emerald-50 border-emerald-200 text-emerald-800',
  error:
    'bg-red-50 border-red-200 text-red-800',
  info:
    'bg-blue-50 border-blue-200 text-blue-800',
  warning:
    'bg-yellow-50 border-yellow-200 text-yellow-800',
};

const typeIcons: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="h-5 w-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

export default function Toast({ id, message, type, onDismiss, duration = 4000, dismissible = true }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const dismiss = useCallback(() => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Wait for exit animation to finish before removing
    setTimeout(() => onDismiss(id), 300);
  }, [id, onDismiss]);

  useEffect(() => {
    // Trigger slide-in on mount
    requestAnimationFrame(() => setVisible(true));

    if (duration > 0) {
      timerRef.current = setTimeout(dismiss, duration);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss, duration]);

  return (
    <div
      data-toast-id={id}
      className={[
        'pointer-events-auto flex w-80 items-start gap-3 rounded-lg border p-4 shadow-lg',
        'transform transition-all duration-300 ease-out',
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        typeStyles[type],
      ].join(' ')}
      role="alert"
      aria-live="polite"
    >
      {typeIcons[type]}
      <p className="flex-1 text-sm font-medium leading-5">{message}</p>
      {id === 'phone-verification-required' && (
        <button
          type="button"
          className="shrink-0 rounded-md bg-yellow-500 px-2 py-1 text-xs font-semibold text-yellow-950 transition-colors hover:bg-yellow-400"
        >
          去认证
        </button>
      )}
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          data-toast-dismiss
          className="ml-1 shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
          aria-label="Dismiss notification"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
