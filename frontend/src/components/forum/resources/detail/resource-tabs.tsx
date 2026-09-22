'use client';

import { ArrowDownToLine, Download, FileArchive, Image as ImageIcon, MessageSquare, Package } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import ResourceReviews from '../../resource-reviews';

export type ResourceTab = 'overview' | 'updates' | 'versions' | 'reviews';

function formatSize(bytes?: number | null) {
  if (!bytes) return '大小未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function ResourceTabs({ resource, activeTab, onChange, downloadUrl }: {
  resource: Resource; activeTab: ResourceTab; onChange: (tab: ResourceTab) => void; downloadUrl: string;
}) {
  const tabs = [
    { id: 'overview' as const, label: '资源介绍', icon: Package },
    { id: 'updates' as const, label: '更新日志', icon: ArrowDownToLine, count: resource.versions?.length || 0 },
    { id: 'versions' as const, label: '文件与版本', icon: FileArchive, count: resource.versions?.length || 0 },
    { id: 'reviews' as const, label: '评价', icon: MessageSquare, count: resource.rating_count || 0 },
  ];
  const metadata = resource.metadata;

  return <section aria-label="资源详情内容" className="min-w-0">
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label="资源详情分区">{tabs.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => onChange(id)} className={`relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold ${activeTab === id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}><Icon className="h-4 w-4" />{label}{count ? <span className="rounded-full bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs">{count}</span> : null}{activeTab === id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--primary)]" />}</button>)}</div>
    {activeTab === 'overview' && <div className="space-y-5"><section className="py-5"><h2 className="mb-4 text-xl font-bold text-[var(--text)]">详细介绍</h2>{resource.content ? <MarkdownRenderer content={resource.content} /> : <p className="text-[var(--text-muted)]">作者还没有补充详细介绍。</p>}</section>{metadata?.gallery_images?.length ? <section className="border-t border-[var(--border)] py-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-[var(--text)]"><ImageIcon className="h-5 w-5" />截图与画廊</h2><div className="grid gap-3 sm:grid-cols-2">{metadata.gallery_images.map((image) => <img key={image} src={image} alt={`${resource.title} 截图`} className={`max-h-80 w-full ${resource.resource_kind === 'map' || resource.resource_kind === 'schematic' ? 'object-contain' : 'object-cover'}`} />)}</div></section> : null}</div>}
    {activeTab === 'updates' && <section className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7"><h2 className="mb-5 text-xl font-bold text-[var(--text)]">更新日志</h2>{metadata?.changelog && <div className="mb-6 border-b border-[var(--border)] pb-6"><MarkdownRenderer content={metadata.changelog} /></div>}{resource.versions?.length ? <div className="space-y-6">{resource.versions.map((version) => <article key={version.id} className="relative border-l-2 border-[var(--primary)] pl-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[var(--text)]">{version.version || '未命名版本'}</h3><time className="text-sm text-[var(--text-muted)]">{new Date(version.published_at || version.created_at).toLocaleDateString('zh-CN')}</time></div>{version.release_notes_markdown || version.release_notes || version.content ? <div className="mt-2"><MarkdownRenderer content={version.release_notes_markdown || version.release_notes || version.content || ''} /></div> : <p className="mt-2 text-sm text-[var(--text-muted)]">此版本未填写更新说明。</p>}</article>)}</div> : <p className="text-[var(--text-muted)]">暂无更新日志。</p>}</section>}
    {activeTab === 'versions' && <section className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7"><h2 className="mb-5 text-xl font-bold text-[var(--text)]">多版本文件</h2>{resource.versions?.length ? <div className="space-y-3">{resource.versions.map((version) => <div key={version.id} className="rounded-md border border-[var(--border)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="rounded bg-[var(--primary-soft)] p-2 text-[var(--primary)]"><FileArchive className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[var(--text)]">资源版本 {version.version || '未标注'}</h3><span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">可下载</span></div><p className="mt-1 break-all text-sm text-[var(--text-muted)]">{version.file_name || '资源文件'} · {formatSize(version.file_size)} · {new Date(version.created_at).toLocaleDateString('zh-CN')}</p>{version.checksum && <details className="mt-1"><summary className="cursor-pointer text-xs text-[var(--text-muted)]">校验信息</summary><p className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">{version.checksum}</p></details>}</div></div><a href={resourceApi.download(resource.id, version.id)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"><Download className="h-4 w-4" />下载</a></div></div>)}</div> : <div className="rounded bg-[var(--bg-elevated)] p-5 text-sm text-[var(--text-muted)]">暂无独立版本记录，将下载当前资源文件。<a href={downloadUrl} className="ml-2 text-[var(--primary)] hover:underline">下载当前文件</a></div>}</section>}
    {activeTab === 'reviews' && <ResourceReviews resource={resource} />}
  </section>;
}
