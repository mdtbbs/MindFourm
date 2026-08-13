/**
 * Toast Store - Zustand state management for toast notifications
 *
 * Manages toast messages displayed to the user
 * Supports multiple toast types: success, error, info, warning
 */

import { useCallback, useMemo } from 'react';
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // Auto-dismiss duration in ms (default: 5000)
  dismissible?: boolean;
  createdAt: number;
}

interface ToastState {
  toasts: ToastItem[];
  maxToasts: number;

  // Actions
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showPersistentToast: (id: string, message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_DURATION = 5000; // 5 seconds

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  maxToasts: 5, // Maximum concurrent toasts

  showToast: (message, type = 'info', duration = DEFAULT_DURATION) => {
    const id = generateId();
    const toast: ToastItem = {
      id,
      message,
      type,
      duration,
      dismissible: true,
      createdAt: Date.now(),
    };

    set((state) => {
      // Remove oldest toast if exceeding max
      let newToasts = [...state.toasts, toast];
      if (newToasts.length > state.maxToasts) {
        const persistentToasts = newToasts.filter((t) => t.dismissible === false);
        const dismissibleToasts = newToasts.filter((t) => t.dismissible !== false);
        const dismissibleLimit = Math.max(state.maxToasts - persistentToasts.length, 0);
        newToasts = [
          ...persistentToasts,
          ...(dismissibleLimit > 0 ? dismissibleToasts.slice(-dismissibleLimit) : []),
        ];
      }
      return { toasts: newToasts };
    });

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, duration);
    }
  },

  showPersistentToast: (id, message, type = 'warning') => {
    set((state) => {
      const existing = state.toasts.find((toast) => toast.id === id);
      const persistentToast: ToastItem = {
        id,
        message,
        type,
        duration: 0,
        // A persistent reminder may be closed. It is recreated after route
        // navigation while the account remains unverified.
        dismissible: true,
        createdAt: existing?.createdAt ?? Date.now(),
      };

      if (existing) {
        return {
          toasts: state.toasts.map((toast) => (toast.id === id ? persistentToast : toast)),
        };
      }

      return {
        toasts: [persistentToast, ...state.toasts].slice(0, state.maxToasts),
      };
    });
  },

  showSuccess: (message) => {
    get().showToast(message, 'success');
  },

  showError: (message) => {
    get().showToast(message, 'error', 8000); // Errors stay longer
  },

  showInfo: (message) => {
    get().showToast(message, 'info');
  },

  showWarning: (message) => {
    get().showToast(message, 'warning', 6000);
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

// Backward compatibility hook that matches existing useToast signature
export function useToast(): {
  showToast: (message: string, type?: ToastType) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
  dismissToast: (id: string) => void;
} {
  // Selected individually rather than via a bare `useToastStore()`. Subscribing to
  // the whole store re-rendered every consumer — including the site header — each
  // time any toast appeared or dismissed. Zustand action identities are stable, so
  // these selectors never fire a re-render.
  const showToastAction = useToastStore((state) => state.showToast);
  const showError = useToastStore((state) => state.showError);
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showInfo = useToastStore((state) => state.showInfo);
  const dismissToast = useToastStore((state) => state.dismissToast);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => showToastAction(message, type),
    [showToastAction],
  );

  return useMemo(
    () => ({ showToast, showError, showSuccess, showInfo, dismissToast }),
    [showToast, showError, showSuccess, showInfo, dismissToast],
  );
}
