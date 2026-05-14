'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Toast, { type ToastType } from '@/components/ui/toast';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Keep a ref so dismiss callbacks don't cause stale closures
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = generateId();
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  const showError = useCallback(
    (message: string) => showToast(message, 'error'),
    [showToast]
  );

  const showSuccess = useCallback(
    (message: string) => showToast(message, 'success'),
    [showToast]
  );

  const showInfo = useCallback(
    (message: string) => showToast(message, 'info'),
    [showToast]
  );

  const value = useMemo(
    () => ({ showToast, showError, showSuccess, showInfo, dismissToast }),
    [showToast, showError, showSuccess, showInfo, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — fixed top-right, above header (z-50) */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={dismissToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
