'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import EmptyState from '@/components/ui/empty-state';
import { REPORT_REASONS, adminReportApi, type AdminReport } from '@/lib/api/client';

const STATUS_FILTERS = [
  { value: 'pending', label: '待处理' },
  { value: 'resolved', label: '已处理' },
  { value: 'dismissed', label: '已驳回' },
  { value: '', label: '全部' },
] as const;

const TARGET_LABELS: Record<string, string> = {
  post: '帖子',
  reply: '回复',
  resource: '资源',
  user: '用户',
};

// Keyed as plain strings: the API may report a reason this build does not know about,
// and the row should still render with the raw value rather than fail to type-check.
const REASON_LABELS = new Map<string, string>(
  REPORT_REASONS.map((item) => [item.value as string, item.label]),
);

/** Where a reported item can be inspected, so a moderator can judge before acting. */
function targetHref(report: AdminReport): string | null {
  switch (report.target_type) {
    case 'post':
      return `/posts/${report.target_id}`;
    case 'resource':
      return `/resources/${report.target_id}`;
    case 'user':
      return `/users/${report.target_id}`;
    // A reply has no page of its own; the anchor only resolves if it is on the first
    // page of the thread, so linking to it would often be wrong.
    default:
      return null;
  }
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [status, setStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const fetchReports = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminReportApi.list({ status: status || undefined, page, limit: 20 });
      setReports(res.data);
      setPagination(res.pagination);
    } catch (err) {
      // An empty queue and a failed request are very different things for a moderator,
      // so they must not render the same way.
      setError(err instanceof Error ? err.message : '加载举报队列失败');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchReports(1);
  }, [fetchReports]);

  const act = async (report: AdminReport, next: 'resolved' | 'dismissed') => {
    setActingOn(report.id);
    setError(null);
    try {
      await adminReportApi.resolve(report.id, {
        status: next,
        resolution_note: notes[report.id]?.trim() || undefined,
      });
      setMessage(next === 'resolved' ? '已标记为处理完成' : '已驳回该举报');
      setTimeout(() => setMessage(null), 3000);
      await fetchReports(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">举报处理</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          成员提交的举报。处理举报本身不会改动被举报的内容，需要另行在对应的审核入口操作。
        </p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && reports.length > 0 ? <Alert type="error" message={error} /> : null}
      {loading && reports.length > 0 ? <InlineLoading label="正在刷新举报队列" /> : null}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((option) => (
          <button
            key={option.value || 'all'}
            onClick={() => setStatus(option.value)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              status === option.value
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && reports.length === 0 ? (
        <InlineLoading label="正在加载举报队列" className="min-h-32" />
      ) : error && reports.length === 0 ? (
        <ErrorState title="举报队列加载失败" description={error} onRetry={() => fetchReports(pagination.page)} />
      ) : reports.length === 0 ? (
        <EmptyState title={status === 'pending' ? '没有待处理的举报' : '没有符合条件的举报'} />
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => {
            const href = targetHref(report);
            return (
              <li
                key={report.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mb-2">
                  <span className="rounded bg-[var(--bg-elevated)] px-2 py-0.5 text-[var(--text-secondary)]">
                    {TARGET_LABELS[report.target_type] ?? report.target_type} #{report.target_id}
                  </span>
                  <span className="font-medium text-[var(--text)]">
                    {REASON_LABELS.get(report.reason) ?? report.reason}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    举报人 {report.reporter ? `#${report.reporter.id}` : '（已注销）'}
                  </span>
                  <time dateTime={report.created_at} className="text-[var(--text-muted)]">
                    {new Date(report.created_at).toLocaleString('zh-CN')}
                  </time>
                  {href && (
                    <Link href={href} target="_blank" className="text-[var(--primary)] hover:underline">
                      查看内容
                    </Link>
                  )}
                </div>

                {report.detail && (
                  <p className="mb-3 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                    {report.detail}
                  </p>
                )}

                {report.status === 'pending' ? (
                  <div className="space-y-2">
                    <label htmlFor={`note-${report.id}`} className="sr-only">
                      处理备注
                    </label>
                    <input
                      id={`note-${report.id}`}
                      value={notes[report.id] ?? ''}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [report.id]: event.target.value }))
                      }
                      placeholder="处理备注（可选，仅管理员可见）"
                      maxLength={500}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={actingOn === report.id}
                        onClick={() => act(report, 'resolved')}
                      >
                        标记已处理
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={actingOn === report.id}
                        onClick={() => act(report, 'dismissed')}
                      >
                        驳回举报
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    {report.status === 'resolved' ? '已处理' : '已驳回'}
                    {report.handled_at && ` · ${new Date(report.handled_at).toLocaleString('zh-CN')}`}
                    {report.resolution_note && ` · ${report.resolution_note}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pagination.totalPages > 1 && (
        // Local paging rather than the shared `Pagination` component: that one navigates
        // by URL, and this page fetches from state, so its links would change the address
        // without changing the list.
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || pagination.page <= 1}
            onClick={() => fetchReports(pagination.page - 1)}
          >
            上一页
          </Button>
          <span className="text-[var(--text-secondary)]">
            第 {pagination.page} / {pagination.totalPages} 页 · 共 {pagination.total} 条
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || pagination.page >= pagination.totalPages}
            onClick={() => fetchReports(pagination.page + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
