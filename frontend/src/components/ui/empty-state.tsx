'use client';

import type { ReactNode } from 'react';
import StatePanel, { type StateAction } from './state-panel';
import { Inbox } from 'lucide-react';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  className?: string;
};

export default function EmptyState(props: EmptyStateProps) {
  return (
    <StatePanel
      {...props}
      icon={props.icon ?? <Inbox className="h-10 w-10" />}
      role="status"
    />
  );
}
