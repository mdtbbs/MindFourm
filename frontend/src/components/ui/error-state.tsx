import type { ElementType } from 'react';
import StatePanel, { type StateAction } from './state-panel';
import { AlertTriangle } from 'lucide-react';

export type ErrorStateProps = {
  icon?: ElementType;
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
      icon={props.icon ?? AlertTriangle}
      role="alert"
      action={action ?? retryAction}
    />
  );
}
