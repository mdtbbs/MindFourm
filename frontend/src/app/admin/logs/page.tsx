'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api/client';
import type { AdminLog } from '@/types';
import { confirmDialog } from '@/store/interaction-dialog-store';
import { getSettingsRollbackAudit } from '@/lib/admin/settings-audit';
import Badge from '@/components/ui/badge';
import Pagination from '@/components/ui/pagination';
import Button from '@/components/ui/button';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export default function AdminLogsPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollbackLoadingId, setRollbackLoadingId] = useState<number | null>(null);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const page = Number(searchParams?.get('page')) || 1;
  const requestId = searchParams?.get('request_id')?.trim() || undefined;

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.getLogs({ page, limit: 20, request_id: requestId });
        if (!cancelled) {
          setLogs(res.data);
          setTotalPages(res.pagination.totalPages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load logs');
          setLogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [page, requestId, refreshCount]);

  const rollbackSettings = async (log: AdminLog) => {
    const audit = getSettingsRollbackAudit(log.action, log.details);
    if (!audit || rollbackLoadingId !== null) return;
    const confirmed = await confirmDialog({
      title: '回滚这次设置更改？',
      message: `将恢复“${audit.category}”分类在操作日志 #${log.id} 修改前的值。若设置已再次更改，服务器会拒绝回滚。`,
      confirmLabel: '回滚设置',
      cancelLabel: '取消',
      destructive: true,
    });
    if (!confirmed) return;

    setRollbackLoadingId(log.id);
    setRollbackMessage(null);
    try {
      await adminApi.rollbackSettings(audit.category, log.id);
      setRollbackMessage(`已回滚操作日志 #${log.id} 的设置。`);
      setRefreshCount((count) => count + 1);
    } catch (cause) {
      setRollbackMessage(cause instanceof Error ? cause.message : '设置回滚失败');
    } finally {
      setRollbackLoadingId(null);
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionBadgeVariant = (action: string): BadgeVariant => {
    const a = action.toLowerCase();
    if (a.includes('delete') || a.includes('remove')) return 'danger';
    if (a.includes('create') || a.includes('add')) return 'success';
    if (a.includes('update') || a.includes('edit')) return 'primary';
    return 'default';
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-surface-900">操作日志</h2>
        <p className="text-sm text-surface-500 mt-1">查看系统管理员操作记录</p>
        {requestId ? <p className="mt-2 text-xs text-surface-500">请求编号：<code>{requestId}</code></p> : null}
        {rollbackMessage ? <p className="mt-2 text-sm text-surface-700" role="status">{rollbackMessage}</p> : null}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-surface-500">加载中...</div>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-200">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      编号
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      用户 ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      操作
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      目标类型
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      目标 ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      详情
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      IP 地址
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      时间
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                      设置
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-surface-200">
                  {logs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-12 text-center text-sm text-surface-500"
                      >
                        暂无日志记录
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-50">
                        <td className="px-4 py-3 text-sm text-surface-600 font-mono whitespace-nowrap">
                          {log.id}
                        </td>
                        <td className="px-4 py-3 text-sm text-surface-600 whitespace-nowrap">
                          {log.user_id != null ? log.user_id : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <Badge variant={getActionBadgeVariant(log.action)}>
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-surface-600 whitespace-nowrap">
                          {log.target_type != null ? log.target_type : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-surface-600 whitespace-nowrap">
                          {log.target_id != null ? log.target_id : '-'}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-surface-600 max-w-xs truncate"
                          title={log.details ?? undefined}
                        >
                          {log.details != null ? log.details : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-surface-600 font-mono whitespace-nowrap">
                          {log.ip_address != null ? log.ip_address : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-surface-600 whitespace-nowrap">
                          {formatTime(log.created_at)}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {getSettingsRollbackAudit(log.action, log.details) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={rollbackLoadingId !== null}
                              onClick={() => void rollbackSettings(log)}
                            >
                              {rollbackLoadingId === log.id ? '回滚中…' : '回滚'}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {logs.length > 0 && (
            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath={pathname ?? '/admin/logs'}
                queryParams={requestId ? { request_id: requestId } : undefined}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
