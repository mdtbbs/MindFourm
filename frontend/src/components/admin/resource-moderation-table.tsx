'use client';

import { useState, useEffect } from 'react';
import { resourceAdminApi } from '@/lib/api/client';
import { Resource } from '@/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Check, X, Eye } from 'lucide-react';

export default function ResourceModerationTable() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);

  const loadPending = () => {
    setLoading(true);
    resourceAdminApi.list({ status: 'pending', limit: 50 })
      .then(res => {
        setResources(res.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadPending(); }, []);

  const handleAction = async (id: number, action: 'approved' | 'rejected') => {
    await resourceAdminApi.updateStatus(id, action);
    setSelectedResource(null);
    loadPending();
  };

  if (loading) return <div className="p-8 text-center">加载中...</div>;

  return (
    <div>
      {selectedResource && (
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold mb-4">{selectedResource.title}</h3>
          {selectedResource.content_html ? (
            <MarkdownRenderer content={selectedResource.content_html} className="mb-4" />
          ) : (
            <p className="text-surface-500 mb-4">{selectedResource.description || '暂无介绍'}</p>
          )}
          {selectedResource.resource_type === 'external' && selectedResource.external_url && (
            <p className="text-sm text-surface-500 mb-2">外链: {selectedResource.external_url}</p>
          )}
          <p className="text-sm text-surface-500 mb-4">上传者: {selectedResource.username}</p>
          <div className="flex gap-3">
            <button
              onClick={() => handleAction(selectedResource.id, 'approved')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
            >
              <Check className="w-4 h-4" /> 通过
            </button>
            <button
              onClick={() => handleAction(selectedResource.id, 'rejected')}
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
                      onClick={() => handleAction(r.id, 'approved')}
                      className="text-sm text-green-600 hover:underline"
                    >
                      通过
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'rejected')}
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