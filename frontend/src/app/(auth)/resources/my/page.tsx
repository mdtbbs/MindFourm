'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { resourceApi } from '@/lib/api/client';
import { Resource } from '@/types';
import { Download, Edit, ExternalLink, FileText, Loader2, Trash2 } from 'lucide-react';
import { useToastStore } from '@/store/toast-store';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  const labels = {
    approved: '已通过',
    pending: '审核中',
    rejected: '已拒绝',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status as keyof typeof styles] || ''}`}>
      {labels[status as keyof typeof labels] || status}
    </span>
  );
}

export default function MyResourcesPage() {
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadResources = () => {
    setLoading(true);
    setError(null);
    resourceApi.getMyResources({ limit: 50 })
      .then((res) => setResources(res.data || []))
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadResources();
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这个资源？删除后无法恢复。')) return;
    setDeletingId(id);
    try {
      await resourceApi.delete(id);
      showSuccess('资源已删除');
      loadResources();
    } catch (err) {
      showError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-[var(--radius-card)] border border-red-300 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/30">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={loadResources}
            className="mt-4 text-sm text-[var(--primary)] hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">我的资源</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">管理你提交的资源</p>
        </div>
        <Link
          href="/resources/submit"
          className="inline-flex items-center rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
        >
          提交新资源
        </Link>
      </div>

      {resources.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] py-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
          <p className="mb-4 text-[var(--text-muted)]">你还没有提交任何资源</p>
          <Link
            href="/resources/submit"
            className="inline-block rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
          >
            提交第一个资源
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium">标题</th>
                <th className="text-left px-4 py-3 font-medium">类型</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">下载</th>
                <th className="text-left px-4 py-3 font-medium">大小</th>
                <th className="text-left px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                  <td className="px-4 py-3">
                    <Link href={`/resources/${r.id}`} className="font-medium text-[var(--text)] hover:text-[var(--primary)]">
                      {r.title}
                    </Link>
                    {r.version && (
                      <span className="ml-2 rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-xs font-mono text-[var(--primary)]">
                        {r.version}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {r.resource_type === 'external' ? (
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> 外链
                      </span>
                    ) : (
                      '文件'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" /> {r.download_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {formatSize(r.file_size) || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/resources/${r.id}/edit`}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-[var(--bg-elevated)]"
                      >
                        <Edit className="h-3 w-3" /> 编辑
                      </Link>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
