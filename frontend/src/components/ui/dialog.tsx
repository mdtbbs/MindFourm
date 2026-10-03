'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

type SurfaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  className?: string;
};

type DialogProps = SurfaceProps & { size?: 'sm' | 'md' | 'lg' };
type SheetProps = SurfaceProps & { side?: 'right' | 'bottom' };

const dialogSizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

function DialogSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel = '关闭',
  initialFocus,
  className = '',
  presentation,
  size,
  side,
}: SurfaceProps & {
  presentation: 'dialog' | 'sheet';
  size?: DialogProps['size'];
  side?: SheetProps['side'];
}) {
  const popupClassName = presentation === 'dialog'
    ? `w-full ${dialogSizes[size || 'md']} max-h-[calc(100dvh-2rem)] rounded-2xl`
    : side === 'bottom'
      ? 'w-full max-h-[min(90dvh,48rem)] self-end rounded-t-2xl'
      : 'ml-auto h-full w-full max-w-xl rounded-l-2xl';

  return (
    <BaseDialog.Root open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-[1px] transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Viewport className={`fixed inset-0 z-[120] flex overflow-y-auto ${presentation === 'dialog' ? 'items-center justify-center p-4' : side === 'bottom' ? 'items-end justify-center' : 'items-stretch justify-end'}`}>
          <BaseDialog.Popup
            initialFocus={initialFocus}
            className={`relative flex shrink-0 flex-col overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] shadow-2xl outline-none ${popupClassName} ${presentation === 'sheet' && side === 'right' ? 'max-h-[100dvh]' : ''} ${className}`}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <BaseDialog.Title className="text-base font-semibold leading-6">{title}</BaseDialog.Title>
                {description && (
                  <BaseDialog.Description className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
                    {description}
                  </BaseDialog.Description>
                )}
              </div>
              <BaseDialog.Close
                aria-label={closeLabel}
                className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <X aria-hidden="true" size={18} />
              </BaseDialog.Close>
            </header>
            {children !== undefined && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>}
            {footer !== undefined && (
              <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--bg-elevated)]/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                {footer}
              </footer>
            )}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Accessible modal surface. Base UI supplies focus management, Escape handling and scroll locking. */
export function Dialog(props: DialogProps) {
  return <DialogSurface {...props} presentation="dialog" />;
}

/** Responsive side or bottom panel using the same modal accessibility behavior. */
export function Sheet(props: SheetProps) {
  return <DialogSurface {...props} presentation="sheet" />;
}
