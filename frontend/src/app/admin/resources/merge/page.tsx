'use client';

import { confirmDialog } from '@/store/interaction-dialog-store';

import { useState } from 'react';
import { resourceAdminApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

type MergePreview = Awaited<ReturnType<typeof resourceAdminApi.previewMerge>>;

const countLabels: Record<string, string> = {
  resource_comments: '评论',
  resource_favorites: '收藏',
  resource_likes: '点赞',
  resource_ratings: '评分',
  resource_subscriptions: '订阅',
  resource_attributions: '贡献者记录',
  resource_versions: '版本',
  resource_files: '版本附件',
  download_events: '下载事件',
  resource_version_dependencies: '版本依赖',
  content_relations: '内容关联',
  knowledge_articles: '知识文章引用',
  game_content_upload_sessions: '上传会话',
  resource_media_links: '媒体链接',
  legacy_root_file: '旧版根文件或外链',
};

export default function ResourceMergePage() {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewMerge = async () => {
    setError(null);
    setResult(null);
    setPreview(null);
    setBusy(true);
    try {
      setPreview(await resourceAdminApi.previewMerge(Number(sourceId), Number(targetId)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法生成合并预览');
    } finally {
      setBusy(false);
    }
  };

  const merge = async () => {
    if (!preview) return;
    const accepted = await confirmDialog({
      title: '确认合并资源',
      message: `确认将「${preview.source.title}」合并到「${preview.target.title}」？来源资源将标记为已合并，API 详情请求会永久重定向到目标资源。`,
      confirmLabel: '合并资源',
      destructive: true,
    });
    if (!accepted) return;
    setBusy(true);
    setError(null);
    try {
      const response = await resourceAdminApi.merge(preview.source.id, preview.target.id);
      setResult(`已完成：资源 ${response.source_id} → ${response.target_id}`);
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '合并失败');
    } finally {
      setBusy(false);
    }
  };

  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <header>
      <h1 className="text-2xl font-semibold text-surface-900 dark:text-gray-100">合并重复资源</h1>
      <p className="mt-2 text-sm text-surface-600 dark:text-gray-400">选择来源和规范资源 ID。预览会显示来源关联数据与版本名冲突，再由管理员确认执行。</p>
    </header>

    <section className="grid gap-4 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-900 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium">来源资源 ID
        <input inputMode="numeric" min="1" type="number" value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="w-full rounded-lg border border-surface-300 bg-transparent px-3 py-2 dark:border-surface-600" />
      </label>
      <label className="space-y-2 text-sm font-medium">目标资源 ID
        <input inputMode="numeric" min="1" type="number" value={targetId} onChange={(event) => setTargetId(event.target.value)} className="w-full rounded-lg border border-surface-300 bg-transparent px-3 py-2 dark:border-surface-600" />
      </label>
      <div className="sm:col-span-2"><Button disabled={busy || !sourceId || !targetId || sourceId === targetId} onClick={previewMerge}>{busy ? '处理中…' : '预览合并'}</Button></div>
    </section>

    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {result && <p role="status" className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">{result}</p>}

    {preview && <section className="space-y-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="text-xs text-surface-500">来源（将保留为合并记录）</p><p className="mt-1 font-semibold">#{preview.source.id} · {preview.source.title}</p><p className="text-xs text-surface-500">状态：{preview.source.status}</p></div>
        <div><p className="text-xs text-surface-500">规范目标</p><p className="mt-1 font-semibold">#{preview.target.id} · {preview.target.title}</p><p className="text-xs text-surface-500">状态：{preview.target.status}</p></div>
      </div>
      <div>
        <h2 className="mb-2 font-medium">来源关联数据</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {Object.entries(preview.source_counts).filter(([key]) => key in countLabels).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-surface-600 dark:text-surface-400">{countLabels[key]}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="mt-3 text-sm">版本名称冲突：<strong>{preview.version_name_collisions}</strong> 个（会保留在来源合并记录中）</p>
      </div>
      <div className="space-y-1 text-xs text-surface-600 dark:text-surface-400">
        <p>用户互动按用户去重，评论、媒体、引用和关系会指向目标。</p>
        <p>目标标题和已有字段优先；来源只补齐目标中的空字段。目标下载量、浏览量和评分会汇总。</p>
        <p>同名版本不会互相覆盖；只有双方均已发布时，可用来源附件才会转为目标版本的补充文件。</p>
      </div>
      <Button disabled={busy} onClick={merge} className="bg-red-700 text-white hover:bg-red-800">{busy ? '正在合并…' : '确认合并资源'}</Button>
    </section>}
  </main>;
}
