'use client';

import type { ReactNode } from 'react';
import StatePanel, { type StateAction } from './state-panel';
import { AlertTriangle } from 'lucide-react';

export type ErrorStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  className?: string;
  onRetry?: () => void;
};

export default function ErrorState({ onRetry, action, ...props }: ErrorStateProps) {
  const retryAction = onRetry ? { label: '重试', onClick: onRetry } : undefined;

  return (
    <StatePanel
      {...props}
      icon={props.icon ?? <AlertTriangle className="h-10 w-10" />}
      role="alert"
      action={action ?? retryAction}
    />
  );
}
