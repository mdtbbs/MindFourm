'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, Download, Package, Tag, User,
} from 'lucide-react';
import { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import { useAuth } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';
import ResourceKindDetails from './resource-kind-details';
import ResourceGallery from './resources/detail/resource-gallery';
import ResourceActions from './resources/detail/resource-actions';
import ResourceTabs, { type ResourceTab } from './resources/detail/resource-tabs';
import ResourceAside from './resources/detail/resource-aside';
import { resourceFileExtension, resourceStatusLabel } from '@/lib/resources/presentation';
import { formatDate } from '@/lib/utils';
import { resourceKindLabel } from '@/lib/display-labels';

interface ResourceDetailProps { resource: Resource; }

export default function ResourceDetail({ resource }: ResourceDetailProps) {
  const { isAuthenticated } = useAuth();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const [activeTab, setActiveTab] = useState<ResourceTab>('overview');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [related, setRelated] = useState<Resource[]>([]);
  const [favorite, setFavorite] = useState(Boolean(resource.is_favorited));
  const [favoriteCount, setFavoriteCount] = useState(resource.favorite_count || 0);
  const [liked, setLiked] = useState(Boolean(resource.is_liked));
  const [likeCount, setLikeCount] = useState(resource.like_count || 0);
  const [subscribed, setSubscribed] = useState(Boolean(resource.is_subscribed));
  const [userRating, setUserRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [schematicCopied, setSchematicCopied] = useState(false);

  const metadata = resource.metadata;
  const rendererMetadata = resource.renderer_metadata && typeof resource.renderer_metadata === 'object'
    ? resource.renderer_metadata as Record<string, unknown>
    : {};
  const isMap = resource.resource_kind === 'map';
  const isSchematic = resource.resource_kind === 'schematic';
  const renderedBuild = typeof rendererMetadata.build === 'number' && rendererMetadata.build > 1
    ? rendererMetadata.build : null;
  const displayTags = [...new Set([
    ...(metadata?.tags || []),
    ...(Array.isArray(rendererMetadata.tags) ? rendererMetadata.tags.filter((item): item is string => typeof item === 'string') : []),
  ])];
  const gallery = useMemo(() => {
    const all = [resource.preview_url, metadata?.cover_image_url, ...(metadata?.gallery_images || [])].filter(Boolean) as string[];
    return [...new Set(all)];
  }, [metadata, resource.preview_url]);
  const downloadUrl = resourceApi.download(resource.id);
  const primaryVersion = resource.versions?.[0];
  const primaryChecksum = primaryVersion?.checksum || resource.content_hash;
  const displayedSupportedVersions = useMemo(() => {
    if (metadata?.supported_versions?.length) return metadata.supported_versions;
    return renderedBuild === null ? [] : [`Build ${renderedBuild}`];
  }, [metadata?.supported_versions, renderedBuild]);
  const displayedCompatibility = metadata?.compatibility || [];
  const downloadExtension = resourceFileExtension(primaryVersion?.file_name || resource.file_name);
  const downloadLabel = isSchematic || isMap ? `下载${downloadExtension ? ` ${downloadExtension}` : '文件'}` : `下载 ${resource.version || primaryVersion?.version || '资源'}`;

  const copyChecksum = async (checksum: string) => {
    await navigator.clipboard.writeText(checksum);
    showSuccess('SHA-256 已复制');
  };

  const copySchematicCode = async () => {
    if (!isSchematic) return;
    try {
      const response = await fetch(primaryVersion ? resourceApi.download(resource.id, primaryVersion.id) : downloadUrl, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('蓝图文件暂时无法读取');
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      const code = btoa(binary);
      if (!code.startsWith('bXNja')) throw new Error('文件不是可复制的 Mindustry 蓝图');
      let copiedToClipboard = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
          copiedToClipboard = true;
        }
      } catch { /* use the legacy fallback below */ }
      if (!copiedToClipboard) {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copiedToClipboard = document.execCommand('copy');
        textarea.remove();
      }
      if (!copiedToClipboard) throw new Error('当前浏览器禁止访问剪贴板，请下载 .msch 文件导入');
      setSchematicCopied(true);
      showSuccess('蓝图代码已复制，可直接在 Mindustry 中导入');
      window.setTimeout(() => setSchematicCopied(false), 2200);
    } catch (error) {
      showSuccess(error instanceof Error ? error.message : '蓝图代码复制失败，请下载 .msch 文件导入');
    }
  };

  useEffect(() => {
    resourceApi.getRelated(resource.id).then(setRelated).catch(() => undefined);
    if (isAuthenticated) {
      resourceApi.getFavorite(resource.id).then((result) => {
        setFavorite(result.is_favorited);
        setFavoriteCount(result.favorite_count);
      }).catch(() => undefined);
      resourceApi.getLike(resource.id).then((result) => {
        setLiked(result.is_liked);
        setLikeCount(result.like_count);
      }).catch(() => undefined);
      resourceApi.getUserRating(resource.id).then((result) => setUserRating(result.rating)).catch(() => undefined);
      resourceApi.getSubscription(resource.id).then((result) => setSubscribed(result.is_subscribed)).catch(() => undefined);
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

  const toggleLike = async () => {
    if (!isAuthenticated) { showSuccess('请先登录后点赞'); return; }
    setBusy(true);
    try {
      const result = liked ? await resourceApi.removeLike(resource.id) : await resourceApi.addLike(resource.id);
      setLiked(result.is_liked);
      setLikeCount(result.like_count);
    } catch (error) { showSuccess(error instanceof Error ? error.message : '点赞操作失败'); }
    setBusy(false);
  };

  const toggleSubscription = async () => {
    if (!isAuthenticated) { showSuccess('请先登录后订阅资源更新'); return; }
    setBusy(true);
    try {
      const result = subscribed ? await resourceApi.unsubscribe(resource.id) : await resourceApi.subscribe(resource.id);
      setSubscribed(result.is_subscribed);
      showSuccess(result.is_subscribed ? '已订阅资源更新' : '已取消订阅');
    } catch (error) { showSuccess(error instanceof Error ? error.message : '订阅操作失败'); }
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

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
      <div>
        <div className="p-5 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row">
            <ResourceGallery title={resource.title} images={gallery} index={galleryIndex} contain={isMap || isSchematic} onSelect={setGalleryIndex} />
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
                {resource.category_name && <Link href={`/resources?category_id=${resource.category_id}`} className="text-[var(--primary)] hover:underline">{resource.category_name}</Link>}
                {resource.resource_kind && <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{resourceKindLabel(resource.resource_kind)}</span>}
                {(primaryVersion?.version || resource.version) && <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">资源版本 {primaryVersion?.version || resource.version}</span>}
                <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-[var(--text-secondary)]">{resourceStatusLabel(resource.status)}</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">{resource.title}</h1>
              <p className="mt-3 max-w-3xl line-clamp-3 text-base leading-7 text-[var(--text-secondary)]">{resource.description || '暂无简短介绍，查看下方完整资源说明。'}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--text-muted)]">
                <Link href={`/users/${resource.user_id}`} className="inline-flex items-center gap-2 hover:text-[var(--primary)]"><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-elevated)]">{resource.avatar_url ? <img src={resource.avatar_url} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}</span>{resource.username || '未知作者'}</Link>
                <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" />{formatDate(resource.updated_at || resource.created_at)} 更新</span>
                <span className="inline-flex items-center gap-1"><Download className="h-4 w-4" />{resource.download_count || 0} 次下载</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">{displayTags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)]"><Tag className="h-3.5 w-3.5" />{tag}</span>)}</div>
              {['map', 'schematic'].includes(resource.resource_kind || '') && resource.renderer_status !== 'ready' && <p className="mt-3 text-sm text-[var(--text-muted)]">{resource.renderer_status === 'processing' ? '正在生成官方 Mindustry 预览图…' : resource.renderer_status === 'failed' ? '预览生成失败，仍可下载原文件。' : '预览服务暂不可用，仍可下载原文件。'}</p>}
            </div>
          </div>
          <ResourceActions
            resource={resource}
            downloadUrl={downloadUrl}
            downloadLabel={downloadLabel}
            primaryVersionId={primaryVersion?.id}
            isSchematic={isSchematic}
            schematicCopied={schematicCopied}
            favorite={favorite}
            favoriteCount={favoriteCount}
            liked={liked}
            likeCount={likeCount}
            subscribed={subscribed}
            busy={busy}
            copied={copied}
            onCopySchematic={copySchematicCode}
            onFavorite={toggleFavorite}
            onLike={toggleLike}
            onSubscribe={toggleSubscription}
            onShare={share}
          />
        </div>

      </div>
    </section>

    <ResourceKindDetails resource={resource} />

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <ResourceTabs resource={resource} activeTab={activeTab} onChange={setActiveTab} downloadUrl={downloadUrl} />
      <ResourceAside
        resource={resource}
        supportedVersions={displayedSupportedVersions}
        compatibility={displayedCompatibility}
        isAuthenticated={isAuthenticated}
        userRating={userRating}
        checksum={primaryChecksum || null}
        onRate={rate}
        onCopyChecksum={copyChecksum}
      />
    </div>

    {related.length > 0 && <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-[var(--text)]">相关推荐</h2><Link href="/resources" className="text-sm text-[var(--primary)] hover:underline">浏览更多资源</Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{related.map((item) => <Link key={item.id} href={`/resources/${item.slug ? `${item.id}-${item.slug}` : item.id}`} className="group rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--primary)]"><div className="flex gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]"><Package className="h-5 w-5" /></div><div className="min-w-0"><h3 className="truncate font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{item.title}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{item.username || '未知作者'} · {item.download_count || 0} 次下载</p></div></div></Link>)}</div></section>}
  </div>;
}
