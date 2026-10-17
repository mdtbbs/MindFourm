import type { ReactNode } from 'react';

/** The reading measure is shared by post bodies, previews and editor surfaces. */
export function RichContentShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rich-content-shell ${className}`}>{children}</div>;
}
