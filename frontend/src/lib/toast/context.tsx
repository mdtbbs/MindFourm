/**
 * Toast Context - Backward compatibility wrapper for Zustand toast store
 *
 * This file provides backward compatibility for existing components
 * that use ToastProvider/useToast pattern, while internally using Zustand.
 *
 * New components should import directly from '@/store/toast-store'
 */

'use client';

import React from 'react';
import { useToastStore, useToast, ToastItem } from '@/store/toast-store';
import Toast from '@/components/ui/toast';

// Re-export useToast for backward compatibility
export { useToast };

/**
 * ToastProvider - Renders toast notifications from Zustand store
 *
 * Renders the toast container and handles toast display.
 * Existing components using useToast() will work without changes.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return (
    <>
      {children}
      {/* Toast container — fixed top-right, above header (z-50) */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast: ToastItem) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            dismissible={toast.dismissible}
            onDismiss={dismissToast}
          />
        ))}
      </div>
    </>
  );
}
