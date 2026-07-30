'use client';

import Badge from '@/components/ui/badge';
import type { QuickCodeStatus } from '@/types/lanlink';

interface Props {
  status: QuickCodeStatus;
}

export function QuickCodeStatus({ status }: Props) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return '未使用';
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold mb-4">快速码状态</h2>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">状态：</span>
          {status.has_code ? (
            <Badge variant="success">已生成</Badge>
          ) : (
            <Badge variant="default">未生成</Badge>
          )}
        </div>

        {status.has_code && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">生成时间：</span>
              <span className="text-sm">{formatDate(status.created_at)}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">最后使用：</span>
              <span className="text-sm">{formatDate(status.last_used_at)}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">使用次数：</span>
              <span className="text-sm">{status.use_count ?? 0} 次</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
