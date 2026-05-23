'use client';

interface ServerStatusBadgeProps {
  status: string;
  label?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: '待审批', className: 'server-status-pending' },
  approved: { label: '已批准', className: 'server-status-running' },
  rejected: { label: '已拒绝', className: 'server-status-rejected' },
  running: { label: '运行中', className: 'server-status-running' },
  stopped: { label: '已停止', className: 'server-status-stopped' },
};

export default function ServerStatusBadge({ status, label }: ServerStatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: 'server-status-stopped' };
  return (
    <span className={`server-status ${config.className}`}>
      {label || config.label}
    </span>
  );
}
