'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine, Calendar, Check, ChevronLeft, ChevronRight, Clipboard,
  Download, ExternalLink, FileArchive, Flag, Heart, Image as ImageIcon,
  Link2, MessageSquare, Package, Share2, ShieldCheck, Star, Tag, User,
} from 'lucide-react';
import { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import { useAuth } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import ReportDialog from './report-dialog';
import ResourceReviews from './resource-reviews';

interface ResourceDetailProps { resource: Resource; }
type TabType = 'overview' | 'updates' | 'versions' | 'reviews';

function formatSize(bytes?: number | null) {
  if (!bytes) return '大小未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Stars({ value, interactive = false, onChange }: { value: number; interactive?: boolean; onChange?: (value: number) => void }) {
  return <div className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} 分`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <button key={star} type="button" disabled={!interactive} onClick={() => onChange?.(star)} className={interactive ? 'cursor-pointer' : 'cursor-default'} aria-label={`${star} 星`}>
        <Star className={`h-4 w-4 ${star <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-[var(--border)]'}`} />
      </button>
    ))}
  </div>;
}

export default function ResourceDetail({ resource }: ResourceDetailProps) {
  const { isAuthenticated } = useAuth();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [related, setRelated] = useState<Resource[]>([]);
  const [favorite, setFavorite] = useState(Boolean(resource.is_favorited));
  const [favoriteCount, setFavoriteCount] = useState(resource.favorite_count || 0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const metadata = resource.metadata;
  const gallery = useMemo(() => {
    const all = [metadata?.cover_image_url, ...(metadata?.gallery_images || [])].filter(Boolean) as string[];
    return [...new Set(all)];
  }, [metadata]);
  const downloadUrl = resourceApi.download(resource.id);
  const primaryVersion = resource.versions?.[0];

  useEffect(() => {
    resourceApi.getRelated(resource.id).then(setRelated).catch(() => undefined);
    if (isAuthenticated) {
      resourceApi.getFavorite(resource.id).then((result) => {
        setFavorite(result.is_favorited);
        setFavoriteCount(result.favorite_count);
      }).catch(() => undefined);
      resourceApi.getUserRating(resource.id).then((result) => setUserRating(result.rating)).catch(() => undefined);
    }
  }, [resource.id, isAuthenticated]);

  const toggleFavorite = async () => {
    if (!isAuthenticated) { showSuccess('请先登录后收藏资源'); return; }
    setBusy(true);
    try {
      const result = favorite ? await resourceApi.removeFavorite(resource.id) : await resourceApi.addFavorite(resource.id);
      setFavorite(result.is_favorited);
      setFavoriteCount(result.favorite_count);
    } catch (error) { showSuccess(error instanceof Error ? error.message : '收藏操作失败'); }
    setBusy(false);
  };

  const rate = async (value: number) => {
    if (!isAuthenticated) { showSuccess('请先登录后评分'); return; }
    try {
      await resourceApi.upsertRating(resource.id, value);
      setUserRating(value);
      showSuccess('评分已保存');
    } catch (error) { showSuccess(error instanceof Error ? error.message : '评分失败'); }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: resource.title, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* cancelled share */ }
  };

  const tabs = [
    { id: 'overview' as const, label: '资源介绍', icon: Package },
    { id: 'updates' as const, label: '更新日志', icon: ArrowDownToLine, count: resource.versions?.length || 0 },
    { id: 'versions' as const, label: '文件与版本', icon: FileArchive, count: resource.versions?.length || 0 },
    { id: 'reviews' as const, label: '评价', icon: MessageSquare, count: resource.rating_count || 0 },
  ];

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-5 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="w-full shrink-0 sm:w-52">
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary)]/80 to-[var(--primary-dark)]">
                {gallery[galleryIndex] ? <img src={gallery[galleryIndex]} alt={`${resource.title} 封面`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-6xl">📦</div>}
                {gallery.length > 1 && <>
                  <button type="button" onClick={() => setGalleryIndex((galleryIndex - 1 + gallery.length) % gallery.length)} className="absolute left-2 top-1/2 rounded-full bg-black/45 p-1 text-white" aria-label="上一张"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setGalleryIndex((galleryIndex + 1) % gallery.length)} className="absolute right-2 top-1/2 rounded-full bg-black/45 p-1 text-white" aria-label="下一张"><ChevronRight className="h-4 w-4" /></button>
                </>}
              </div>
              {gallery.length > 1 && <div className="mt-2 flex gap-2 overflow-x-auto">{gallery.map((image, index) => <button key={image} type="button" onClick={() => setGalleryIndex(index)} className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 ${galleryIndex === index ? 'border-[var(--primary)]' : 'border-transparent'}`}><img src={image} alt={`截图 ${index + 1}`} className="h-full w-full object-cover" /></button>)}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
                {resource.category_name && <Link href={`/resources?category_id=${resource.category_id}`} className="text-[var(--primary)] hover:underline">{resource.category_name}</Link>}
                {resource.resource_kind && <span className="rounded-full bg-[var(--bg-secondary)] px-2.5 py-1">{resource.resource_kind}</span>}
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600">已审核</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">{resource.title}</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-secondary)]">{resource.description || '暂无简短介绍，查看下方完整资源说明。'}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--text-muted)]">
                <Link href={`/users/${resource.user_id}`} className="inline-flex items-center gap-2 hover:text-[var(--primary)]"><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-secondary)]">{resource.avatar_url ? <img src={resource.avatar_url} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}</span>{resource.username || '未知作者'}</Link>
                <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(resource.updated_at || resource.created_at).toLocaleDateString('zh-CN')} 更新</span>
                <span className="inline-flex items-center gap-1"><Download className="h-4 w-4" />{resource.download_count || 0} 次下载</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">{(metadata?.tags || []).map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)]"><Tag className="h-3.5 w-3.5" />{tag}</span>)}</div>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
            <a href={primaryVersion ? resourceApi.download(resource.id, primaryVersion.id) : downloadUrl} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 font-semibold text-white transition hover:bg-[var(--primary-dark)]"><Download className="h-5 w-5" />下载资源</a>
            <button type="button" disabled={busy} onClick={toggleFavorite} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium transition ${favorite ? 'border-rose-300 bg-rose-500/10 text-rose-500' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-rose-500'}`}><Heart className={`h-5 w-5 ${favorite ? 'fill-current' : ''}`} />{favorite ? '已收藏' : '收藏'} <span className="text-xs">{favoriteCount}</span></button>
            <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 font-medium text-[var(--text-secondary)] hover:text-[var(--primary)]"><Share2 className="h-5 w-5" />{copied ? '链接已复制' : '分享'}</button>
            <ReportDialog targetType="resource" targetId={resource.id} label="举报" />
          </div>
        </div>
        <aside className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/45 p-5 lg:border-l lg:border-t-0 lg:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">作者信息</h2>
          <Link href={`/users/${resource.user_id}`} className="mt-4 flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--bg-card)]"><span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">{resource.avatar_url ? <img src={resource.avatar_url} alt="" className="h-full w-full object-cover" /> : <User className="h-6 w-6" />}</span><span className="min-w-0"><span className="block truncate font-semibold text-[var(--text)]">{resource.username || '未知作者'}</span><span className="text-sm text-[var(--text-muted)]">查看作者主页</span></span><ExternalLink className="ml-auto h-4 w-4 text-[var(--text-muted)]" /></Link>
          <div className="mt-5 grid grid-cols-2 gap-3 text-center"><div className="rounded-lg bg-[var(--bg-card)] p-3"><div className="font-semibold text-[var(--text)]">{resource.download_count || 0}</div><div className="mt-1 text-xs text-[var(--text-muted)]">下载</div></div><div className="rounded-lg bg-[var(--bg-card)] p-3"><div className="font-semibold text-[var(--text)]">{favoriteCount}</div><div className="mt-1 text-xs text-[var(--text-muted)]">收藏</div></div></div>
          <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-[var(--text-muted)]">当前版本</span><span className="font-medium text-[var(--text)]">{resource.version || primaryVersion?.version || '未标注'}</span></div><div className="flex justify-between"><span className="text-[var(--text-muted)]">文件类型</span><span className="font-medium text-[var(--text)]">{resource.mime_type || resource.resource_type}</span></div><div className="flex justify-between"><span className="text-[var(--text-muted)]">更新时间</span><span className="font-medium text-[var(--text)]">{new Date(resource.updated_at).toLocaleDateString('zh-CN')}</span></div></div>
        </aside>
      </div>
    </section>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0">
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)]">{tabs.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold ${activeTab === id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>{<Icon className="h-4 w-4" />}{label}{count ? <span className="rounded-full bg-[var(--bg-secondary)] px-1.5 py-0.5 text-xs">{count}</span> : null}{activeTab === id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--primary)]" />}</button>)}</div>
        {activeTab === 'overview' && <div className="space-y-5"><section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7"><h2 className="mb-4 text-xl font-bold text-[var(--text)]">详细介绍</h2>{resource.content ? <MarkdownRenderer content={resource.content} /> : <p className="text-[var(--text-muted)]">作者还没有补充详细介绍。</p>}</section>{metadata?.gallery_images?.length ? <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7"><h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-[var(--text)]"><ImageIcon className="h-5 w-5" />截图与画廊</h2><div className="grid gap-3 sm:grid-cols-2">{metadata.gallery_images.map((image) => <img key={image} src={image} alt={`${resource.title} 截图`} className="max-h-80 w-full rounded-lg object-cover" />)}</div></section> : null}</div>}
        {activeTab === 'updates' && <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7"><h2 className="mb-5 text-xl font-bold text-[var(--text)]">更新日志</h2>{metadata?.changelog && <div className="mb-6 border-b border-[var(--border)] pb-6"><MarkdownRenderer content={metadata.changelog} /></div>}{resource.versions?.length ? <div className="space-y-6">{resource.versions.map((version) => <article key={version.id} className="relative border-l-2 border-[var(--primary)] pl-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[var(--text)]">{version.version || '未命名版本'}</h3><span className="text-sm text-[var(--text-muted)]">{new Date(version.published_at || version.created_at).toLocaleDateString('zh-CN')}</span></div>{version.release_notes_markdown || version.release_notes || version.content ? <div className="mt-2"><MarkdownRenderer content={version.release_notes_markdown || version.release_notes || version.content || ''} /></div> : <p className="mt-2 text-sm text-[var(--text-muted)]">此版本未填写更新说明。</p>}</article>)}</div> : <p className="text-[var(--text-muted)]">暂无更新日志。</p>}</section>}
        {activeTab === 'versions' && <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7"><h2 className="mb-5 text-xl font-bold text-[var(--text)]">多版本文件</h2>{resource.versions?.length ? <div className="space-y-3">{resource.versions.map((version) => <div key={version.id} className="rounded-xl border border-[var(--border)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="rounded-lg bg-[var(--primary)]/10 p-2 text-[var(--primary)]"><FileArchive className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[var(--text)]">版本 {version.version || '未标注'}</h3><span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">可下载</span></div><p className="mt-1 truncate text-sm text-[var(--text-muted)]">{version.file_name || '资源文件'} · {formatSize(version.file_size)} · {new Date(version.created_at).toLocaleDateString('zh-CN')}</p>{version.checksum && <p className="mt-1 flex items-center gap-1 break-all text-xs text-[var(--text-muted)]"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />校验值：{version.checksum}</p>}</div></div><a href={resourceApi.download(resource.id, version.id)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"><Download className="h-4 w-4" />下载</a></div></div>)}</div> : <div className="rounded-lg bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-muted)]">暂无独立版本记录，将下载当前资源文件。<a href={downloadUrl} className="ml-2 text-[var(--primary)] hover:underline">下载当前文件</a></div>}</section>}
        {activeTab === 'reviews' && <ResourceReviews resource={resource} />}
      </main>
      <aside className="space-y-5">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><ShieldCheck className="h-4 w-4 text-emerald-600" />支持与兼容性</h2><div className="mt-4 space-y-4 text-sm"><div><div className="mb-2 text-[var(--text-muted)]">支持版本</div><div className="flex flex-wrap gap-2">{metadata?.supported_versions?.length ? metadata.supported_versions.map((item) => <span key={item} className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-[var(--text-secondary)]">{item}</span>) : <span className="text-[var(--text-muted)]">作者未标注</span>}</div></div><div><div className="mb-2 text-[var(--text-muted)]">兼容性</div><div className="flex flex-wrap gap-2">{metadata?.compatibility?.length ? metadata.compatibility.map((item) => <span key={item} className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-emerald-700">{item}</span>) : <span className="text-[var(--text-muted)]">作者未标注</span>}</div></div></div></section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><Star className="h-4 w-4 text-amber-400" />社区评分</h2><div className="mt-4 flex items-center gap-3"><span className="text-3xl font-bold text-[var(--text)]">{(resource.rating_average || 0).toFixed(1)}</span><div><Stars value={resource.rating_average || 0} /><p className="mt-1 text-xs text-[var(--text-muted)]">{resource.rating_count || 0} 人评分</p></div></div>{isAuthenticated && <div className="mt-4 border-t border-[var(--border)] pt-4"><p className="mb-2 text-sm text-[var(--text-muted)]">给这个资源评分</p><Stars value={userRating || 0} interactive onChange={rate} /></div>}</section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><Clipboard className="h-4 w-4" />资源信息</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">创建时间</dt><dd className="text-right text-[var(--text)]">{new Date(resource.created_at).toLocaleDateString('zh-CN')}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">文件数量</dt><dd className="text-right text-[var(--text)]">{resource.versions?.length || 1}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">最新文件</dt><dd className="max-w-[150px] truncate text-right text-[var(--text)]">{primaryVersion?.file_name || resource.file_name || '外部链接'}</dd></div></dl></section>
      </aside>
    </div>

    {related.length > 0 && <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-[var(--text)]">相关推荐</h2><Link href="/resources" className="text-sm text-[var(--primary)] hover:underline">浏览更多资源</Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{related.map((item) => <Link key={item.id} href={`/resources/${item.slug ? `${item.id}-${item.slug}` : item.id}`} className="group rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--primary)]"><div className="flex gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--primary)]/80 to-[var(--primary-dark)] text-xl">📦</div><div className="min-w-0"><h3 className="truncate font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{item.title}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{item.username || '未知作者'} · {item.download_count || 0} 次下载</p></div></div></Link>)}</div></section>}
  </div>;
}
