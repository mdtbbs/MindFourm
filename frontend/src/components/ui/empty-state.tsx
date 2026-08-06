import type { ElementType } from 'react';
import StatePanel, { type StateAction } from './state-panel';
import { Inbox } from 'lucide-react';

export type EmptyStateProps = {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  className?: string;
};

export default function EmptyState(props: EmptyStateProps) {
  return <StatePanel {...props} icon={props.icon ?? Inbox} role="status" />;
}
