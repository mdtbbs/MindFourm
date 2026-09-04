'use client';

import { useState, useEffect } from 'react';
import { resourceAdminApi } from '@/lib/api/client';
import { Resource } from '@/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Check, X, Eye } from 'lucide-react';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';

export default function ResourceModerationTable() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  // Without this a failed load rendered "暂无待审批资源" — a moderator would read
  // that as "nothing to review" and move on, while the queue was actually unread.
  const [error, setError] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ resource: Resource } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const loadPending = () => {
    setLoading(true);
    setError(null);
    resourceAdminApi.list({ status: 'pending', limit: 50 })
      .then(res => setResources(res.data || []))
      .catch((err) => setError(err instanceof Error ? err.message : '加载待审资源失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPending(); }, []);

  const handleApprove = async (id: number) => {
    try {
      await resourceAdminApi.updateStatus(id, 'approved');
      setSelectedResource(null);
      loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : '审核操作失败');
    }
  };

  const handleRejectClick = (resource: Resource) => {
    setRejectDialog({ resource });
    setRejectReason('');
  };

  const handleRejectConfirm = async () => {
    if (!rejectDialog) return;
    setIsRejecting(true);
    try {
      await resourceAdminApi.updateStatus(rejectDialog.resource.id, 'rejected', rejectReason || undefined);
      setRejectDialog(null);
      setSelectedResource(null);
      loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : '审核操作失败');
    } finally {
      setIsRejecting(false);
    }
  };

  if (loading && resources.length === 0) return <InlineLoading label="正在加载待审批资源" className="min-h-32" />;

  if (error && resources.length === 0) {
    return <ErrorState title="待审批资源加载失败" description={error} onRetry={loadPending} />;
  }

  return (
    <div>
      {selectedResource && (
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold mb-4">{selectedResource.title}</h3>
          {selectedResource.description && (
            <div className="mb-4 rounded-lg bg-surface-50 p-4 dark:bg-gray-800">
              <h4 className="mb-2 text-sm font-medium text-surface-700 dark:text-gray-300">短介绍</h4>
              <MarkdownRenderer content={selectedResource.description} />
            </div>
          )}
          {selectedResource.content ? (
            <MarkdownRenderer content={selectedResource.content} className="mb-4" />
          ) : (
            !selectedResource.description && <p className="text-surface-500 mb-4">暂无介绍</p>
          )}
          {selectedResource.resource_type === 'external' && selectedResource.external_url && (
            <p className="text-sm text-surface-500 mb-2">外链: {selectedResource.external_url}</p>
          )}
          <p className="text-sm text-surface-500 mb-4">上传者: {selectedResource.username}</p>
          <div className="flex gap-3">
            <button
              onClick={() => handleApprove(selectedResource.id)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
            >
              <Check className="w-4 h-4" /> 通过
            </button>
            <button
              onClick={() => handleRejectClick(selectedResource)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
            >
              <X className="w-4 h-4" /> 拒绝
            </button>
            <button
              onClick={() => setSelectedResource(null)}
              className="px-4 py-2 text-sm text-surface-500 hover:text-surface-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {rejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              拒绝资源：{rejectDialog.resource.title}
            </h3>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                拒绝理由（可选）
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请说明拒绝的原因，例如：内容不符合规范、包含违规信息等"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectDialog(null)}
                disabled={isRejecting}
                className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                取消
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={isRejecting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isRejecting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 dark:border-gray-700 bg-surface-50 dark:bg-gray-800">
              <th className="text-left px-4 py-3 font-medium">标题</th>
              <th className="text-left px-4 py-3 font-medium">类型</th>
              <th className="text-left px-4 py-3 font-medium">上传者</th>
              <th className="text-left px-4 py-3 font-medium">上传时间</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {resources.map(r => (
              <tr key={r.id} className="border-b border-surface-100 dark:border-gray-800 hover:bg-surface-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium">{r.title}</td>
                <td className="px-4 py-3">{r.resource_type === 'external' ? '外链' : '文件'}</td>
                <td className="px-4 py-3">{r.username}</td>
                <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedResource(r)}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      <Eye className="w-4 h-4 inline" /> 查看
                    </button>
                    <button
                      onClick={() => handleApprove(r.id)}
                      className="text-sm text-green-600 hover:underline"
                    >
                      通过
                    </button>
                    <button
                      onClick={() => handleRejectClick(r)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      拒绝
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {resources.length === 0 && (
          <div className="p-8 text-center text-surface-500">暂无待审批资源</div>
        )}
      </div>
    </div>
  );
}