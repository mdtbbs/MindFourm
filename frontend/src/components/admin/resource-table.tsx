'use client';

import { useCallback, useEffect, useState } from 'react';
import { resourceAdminApi, resourceApi } from '@/lib/api/client';
import type { Resource, ResourceCategory } from '@/types';
import { Download, Eye, ExternalLink, FileDown, Star, Trash2 } from 'lucide-react';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import { useI18n } from '@/i18n/provider';
import { promptDialog } from '@/store/interaction-dialog-store';

interface ResourceTableProps {
  initialSearch?: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rendererLabel(resource: Resource): string {
  if (!resource.renderer_status) return '—';
  if (resource.renderer_status === 'ready') return '已解析';
  if (resource.renderer_status === 'processing') return '解析中';
  if (resource.renderer_status === 'failed') return '解析失败';
  return resource.renderer_status;
}

export default function ResourceTable({ initialSearch = '' }: ResourceTableProps) {
  const { locale } = useI18n();
  const english = locale !== 'zh-CN';
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState(initialSearch);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      resourceAdminApi.list({
        limit: 50,
        status: status || undefined,
        search: search || undefined,
      }),
      resourceApi.getCategories(),
    ])
      .then(([resourceResult, categoryResult]) => {
        setResources(resourceResult.data || []);
        setCategories(categoryResult);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : '加载资源失败');
      })
      .finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 180);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleDelete = async (resource: Resource) => {
    const typed = await promptDialog({
      title: '确认删除资源',
      message: '删除资源会影响前台和第三方 API。请输入资源标题以继续。',
      label: `资源标题：${resource.title}`,
      required: true,
      validate: (value) => value === resource.title ? null : '输入内容与资源标题不一致',
      submitLabel: '删除资源',
    });
    if (typed !== resource.title) return;

    try {
      await resourceAdminApi.delete(resource.id);
      loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    }
  };

  const handleStatusChange = async (resource: Resource, newStatus: string) => {
    if (newStatus === resource.status) return;

    try {
      await resourceAdminApi.updateStatus(resource.id, newStatus);
      loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新状态失败');
    }
  };

  const handleFeaturedChange = async (resource: Resource, featured: boolean) => {
    try {
      await resourceAdminApi.updateFeatured(resource.id, featured);
      loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新精选状态失败');
    }
  };

  const handleExport = async (resource: Resource) => {
    try {
      const manifest = await resourceAdminApi.exportManifest(resource.id);
      const fileName = `${resource.title.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'resource'}.mindustry-resource.json`;
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (english ? 'Export failed.' : '导出失败。'));
    }
  };

  if (loading && resources.length === 0) {
    return <InlineLoading label="正在加载资源" className="min-h-32" />;
  }

  if (error && resources.length === 0) {
    return <ErrorState title="资源加载失败" description={error} onRetry={loadData} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索标题、作者或资源 ID"
          className="min-w-[240px] flex-1 border border-surface-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="border border-surface-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="approved">已通过</option>
          <option value="pending">待审批</option>
          <option value="rejected">已拒绝</option>
        </select>
      </div>

      {loading && resources.length > 0 ? <InlineLoading label="正在刷新资源" className="min-h-8" /> : null}
      {error && resources.length > 0 ? (
        <ErrorState title="刷新资源失败" description={error} onRetry={loadData} className="min-h-0 py-3" />
      ) : null}

      <div className="overflow-x-auto border border-surface-200 bg-white">
        <table className="min-w-[1120px] w-full text-sm">
          <thead className="border-b border-surface-200 bg-surface-50 text-left text-xs text-surface-500">
            <tr>
              <th className="px-4 py-3 font-medium">资源</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">版本</th>
              <th className="px-4 py-3 font-medium">分类</th>
              <th className="px-4 py-3 font-medium">文件</th>
              <th className="px-4 py-3 font-medium">解析</th>
              <th className="px-4 py-3 font-medium">数据</th>
              <th className="px-4 py-3 font-medium">精选</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {resources.map((resource) => {
              const featured = resource.is_featured === true || resource.is_featured === 1;
              return (
                <tr key={resource.id} className="hover:bg-surface-50">
                  <td className="max-w-[280px] px-4 py-3">
                    <div className="truncate font-medium text-surface-900">{resource.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-surface-400">
                      <span className="font-mono">#{resource.id}</span>
                      <span>{resource.username || '未知作者'}</span>
                      {resource.resource_type === 'external' ? <ExternalLink className="h-3 w-3" /> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-600">{resource.resource_kind || resource.resource_type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-surface-600">{resource.version || '—'}</td>
                  <td className="px-4 py-3 text-xs text-surface-600">
                    {categories.find((category) => category.id === resource.category_id)?.name || resource.category_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-500">{formatSize(resource.file_size)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${resource.renderer_status === 'failed' ? 'text-red-600' : resource.renderer_status === 'processing' ? 'text-amber-600' : 'text-surface-600'}`}>
                      {rendererLabel(resource)}
                    </span>
                    {resource.renderer_error_code ? <div className="mt-1 font-mono text-[9px] text-red-500">{resource.renderer_error_code}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 font-mono text-[10px] text-surface-500">
                      <span className="inline-flex items-center gap-1"><Download className="h-3 w-3" />{resource.download_count}</span>
                      <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{Number(resource.view_count) || 0}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void handleFeaturedChange(resource, !featured)}
                      aria-label={featured ? '取消精选' : '设为精选'}
                      aria-pressed={featured}
                      className={featured ? 'text-amber-500 hover:text-amber-600' : 'text-surface-400 hover:text-amber-500'}
                    >
                      <Star className="h-4 w-4" fill={featured ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={resource.status}
                      onChange={(event) => void handleStatusChange(resource, event.target.value)}
                      className="border border-surface-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="approved">已通过</option>
                      <option value="pending">待审批</option>
                      <option value="rejected">已拒绝</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleExport(resource)}
                        className="inline-flex p-1 text-surface-500 hover:bg-surface-100 hover:text-surface-900"
                        aria-label={english ? `Export ${resource.title}` : `导出 ${resource.title}`}
                        title={english ? 'Export transfer manifest' : '导出迁移清单'}
                      >
                        <FileDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(resource)}
                        className="inline-flex p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                        aria-label={`${english ? 'Delete' : '删除'} ${resource.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {resources.length === 0 ? (
          <div className="p-10 text-center text-sm text-surface-400">没有符合当前筛选条件的资源。</div>
        ) : null}
      </div>
    </div>
  );
}
