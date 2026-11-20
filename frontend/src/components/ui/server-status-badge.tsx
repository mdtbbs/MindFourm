'use client';

import { useI18n } from '@/i18n/provider';

interface ServerStatusBadgeProps {
  status: string;
  label?: string;
}

/**
 * Status keys map to locale keys rather than literal copy: the same badge is
 * rendered on the MDTBBS console and on the Club server directory.
 */
const STATUS: Record<string, { labelKey: string; className: string }> = {
  pending: { labelKey: 'servers.approvalPending', className: 'server-status-pending' },
  approved: { labelKey: 'servers.approvalApproved', className: 'server-status-running' },
  rejected: { labelKey: 'servers.approvalRejected', className: 'server-status-rejected' },
  running: { labelKey: 'servers.online', className: 'server-status-running' },
  stopped: { labelKey: 'servers.stopped', className: 'server-status-stopped' },
};

export default function ServerStatusBadge({ status, label }: ServerStatusBadgeProps) {
  const { t } = useI18n();
  const config = STATUS[status];
  return (
    <span className={`server-status ${config?.className || 'server-status-stopped'}`}>
      {label || (config ? t(config.labelKey) : status)}
    </span>
  );
}
