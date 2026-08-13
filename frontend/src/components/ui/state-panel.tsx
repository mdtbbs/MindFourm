'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from './button';

export type StateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
};

export type StatePanelProps = {
  /**
   * A rendered icon element (not a component function). Passing a component
   * function would break when the parent is a Server Component, because React
   * cannot serialize functions across the RSC boundary.
   */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  role?: 'status' | 'alert';
  className?: string;
  children?: ReactNode;
};

function Action({ action, secondary = false }: { action: StateAction; secondary?: boolean }) {
  if (action.href) {
    return (
      <Link
        href={action.href}
        className={buttonVariants({ variant: secondary ? 'outline' : 'default' })}
      >
        {action.label}
      </Link>
    );
  }

  return (
    <Button variant={secondary ? 'outline' : 'default'} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function StatePanel({
  icon,
  title,
  description,
  action,
  secondaryAction,
  role = 'status',
  className,
  children,
}: StatePanelProps) {
  return (
    <section
      role={role}
      className={cn(
        'flex min-h-[180px] w-full flex-col items-center justify-center px-4 py-8 text-center',
        'rounded-lg border border-[var(--border)] bg-[var(--bg-card)]',
        className
      )}
    >
      {icon && (
        <div className="mb-3 h-10 w-10 text-[var(--text-muted)] [&>svg]:h-10 [&>svg]:w-10" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">{description}</p>}
      {children}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action && <Action action={action} />}
          {secondaryAction && <Action action={secondaryAction} secondary />}
        </div>
      )}
    </section>
  );
}

export default StatePanel;
