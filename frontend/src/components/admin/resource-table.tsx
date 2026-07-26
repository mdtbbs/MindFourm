'use client';

import { useState, useEffect } from 'react';
import { resourceAdminApi, resourceApi } from '@/lib/api/client';
import { Resource, ResourceCategory } from '@/types';
import { ExternalLink, Download, Trash2 } from 'lucide-react';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourceTable() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // Swallowing the failure left the table showing "暂无资源", which is
  // indistinguishable from genuinely having none.
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      resourceAdminApi.list({ limit: 50, status: status || undefined, search: search || undefined }),
      resourceApi.getCategories(),
    ]).then(([resRes, cats]) => {
      setResources(resRes.data || []);
      setCategories(cats);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : '加载资源失败');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [status, search]);

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此资源？')) return;
    try {
      await resourceAdminApi.delete(id);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await resourceAdminApi.updateStatus(id, newStatus);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新状态失败');
    }
  };

  if (loading) return <div className="p-8 text-center">加载中...</div>;

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-red-600">{error}</p>
        <button type="button" onClick={loadData} className="text-sm text-primary-600 underline">
          重试
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索资源..."
          className="flex-1 px-3 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg text-sm"
        >
          <option value="">全部状态</option>
          <option value="approved">已通过</option>
          <option value="pending">待审批</option>
          <option value="rejected">已拒绝</option>
        </select>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 dark:border-gray-700 bg-surface-50 dark:bg-gray-800">
              <th className="text-left px-4 py-3 font-medium">标题</th>
              <th className="text-left px-4 py-3 font-medium">类型</th>
              <th className="text-left px-4 py-3 font-medium">版本</th>
              <th className="text-left px-4 py-3 font-medium">类别</th>
              <th className="text-left px-4 py-3 font-medium">大小</th>
              <th className="text-left px-4 py-3 font-medium">下载</th>
              <th className="text-left px-4 py-3 font-medium">状态</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {resources.map(r => (
              <tr key={r.id} className="border-b border-surface-100 dark:border-gray-800 hover:bg-surface-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium max-w-[200px] truncate">{r.title}</td>
                <td className="px-4 py-3">
                  {r.resource_type === 'external' ? (
                    <span className="flex items-center gap-1"><ExternalLink className="w-3 h-3" /> 外链</span>
                  ) : (
                    <span>文件</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.version || '-'}</td>
                <td className="px-4 py-3">{r.category_name || '-'}</td>
                <td className="px-4 py-3">{formatSize(r.file_size) || '-'}</td>
                <td className="px-4 py-3 flex items-center gap-1"><Download className="w-3 h-3" /> {r.download_count}</td>
                <td className="px-4 py-3">
                  <select
                    value={r.status}
                    onChange={(e) => handleStatusChange(r.id, e.target.value)}
                    className="text-xs px-2 py-1 bg-surface-50 dark:bg-gray-700 border rounded"
                  >
                    <option value="approved">已通过</option>
                    <option value="pending">待审批</option>
                    <option value="rejected">已拒绝</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {resources.length === 0 && (
          <div className="p-8 text-center text-surface-500">暂无资源</div>
        )}
      </div>
    </div>
  );
}