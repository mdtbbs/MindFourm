'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, Download, Eye, Package, Tag, User,
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
import { resourceCardFacts, resourceFileExtension } from '@/lib/resources/presentation';
import { useI18n } from '@/i18n/provider';

interface ResourceDetailProps { resource: Resource; selectedVersionPublicId?: string; }

const RESOURCE_FACT_KEYS: Record<string, string> = {
  '地图尺寸': 'mapSize', '模式': 'mode', '星球': 'planet', '出生点': 'spawns', '核心': 'cores',
  '蓝图尺寸': 'schematicSize', '方块': 'blocks', '净功率': 'netPower', 'Mod 版本': 'modVersion',
  '支持游戏版本': 'supportedGameVersions', '平台': 'platform', '游戏版本': 'gameVersion', '渠道': 'channel',
  '资源版本': 'resourceVersion', '适用版本': 'compatibleVersions',
};

export default function ResourceDetail({ resource, selectedVersionPublicId }: ResourceDetailProps) {
  const { t, locale } = useI18n();
  const { isAuthenticated, user } = useAuth();
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
  const [commentCount, setCommentCount] = useState(resource.comment_count || 0);
  const [viewCount, setViewCount] = useState(Number(resource.view_count || 0));
  const updateCommentCount = useCallback((count: number) => setCommentCount(count), []);

  const metadata = resource.metadata;
  const rendererMetadata = resource.renderer_metadata && typeof resource.renderer_metadata === 'object'
    ? resource.renderer_metadata as Record<string, unknown>
    : {};
  const isMap = resource.resource_kind === 'map';
  const isSchematic = resource.resource_kind === 'schematic';
  const displayTags = [...new Set([
    ...(metadata?.tags || []),
    ...(Array.isArray(rendererMetadata.tags) ? rendererMetadata.tags.filter((item): item is string => typeof item === 'string') : []),
  ])];
  const gallery = useMemo(() => {
    const all = [resource.preview_url, metadata?.cover_image_url, ...(metadata?.gallery_images || [])].filter(Boolean) as string[];
    return [...new Set(all)];
  }, [metadata, resource.preview_url]);
  const downloadUrl = resourceApi.download(resource.id);
  const selectedVersion = selectedVersionPublicId
    ? resource.versions?.find((version) => version.public_id === selectedVersionPublicId)
    : undefined;
  const primaryVersion = selectedVersion || resource.versions?.[0];
  const primaryChecksum = primaryVersion?.checksum || resource.content_hash;
  const displayedSupportedVersions = metadata?.supported_versions || [];
  const displayedCompatibility = metadata?.compatibility || [];
  const quickFacts = resourceCardFacts(resource).slice(0, 4);
  const resourceKind = resource.resource_kind && ['map', 'schematic', 'mod', 'pack', 'game_version', 'server_plugin', 'development_tool', 'texture_ui', 'save'].includes(resource.resource_kind)
    ? resource.resource_kind : 'other';
  const statusKey = resource.status === 'approved' || resource.status === 'published' ? 'statusPublished'
    : resource.status === 'pending' || resource.status === 'pending_review' ? 'statusPending'
      : resource.status === 'rejected' ? 'statusRejected' : resource.status === 'archived' ? 'statusArchived' : 'statusUnknown';
  const downloadExtension = resourceFileExtension(primaryVersion?.file_name || resource.file_name);
  const downloadLabel = isSchematic || isMap
    ? downloadExtension ? t('resourceActions.download', { name: downloadExtension }) : t('resourceActions.downloadFile')
    : t('resourceActions.download', { name: resource.version || primaryVersion?.version || t('resourceTabs.file') });

  const copyChecksum = async (checksum: string) => {
    await navigator.clipboard.writeText(checksum);
    showSuccess(t('resourceDetail.checksumCopied'));
  };

  const copySchematicCode = async () => {
    if (!isSchematic) return;
    try {
      const response = await fetch(primaryVersion ? resourceApi.download(resource.id, primaryVersion.id) : downloadUrl, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(t('resourceDetail.schematicDownloadUnavailable'));
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      const code = btoa(binary);
      if (!code.startsWith('bXNja')) throw new Error(t('resourceDetail.notSchematic'));
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
      if (!copiedToClipboard) throw new Error(t('resourceDetail.clipboardBlocked'));
      setSchematicCopied(true);
      showSuccess(t('resourceDetail.schematicCopied'));
      window.setTimeout(() => setSchematicCopied(false), 2200);
    } catch (error) {
      showSuccess(error instanceof Error ? error.message : t('resourceDetail.schematicCopyFailed'));
    }
  };

  useEffect(() => {
    resourceApi.getRelated(resource.id).then(setRelated).catch(() => undefined);
    resourceApi.recordView(resource.id).then((result) => setViewCount(result.view_count)).catch(() => undefined);
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
    if (!isAuthenticated) { showSuccess(t('resourceDetail.favoriteSignIn')); return; }
    setBusy(true);
    try {
      const result = favorite ? await resourceApi.removeFavorite(resource.id) : await resourceApi.addFavorite(resource.id);
      setFavorite(result.is_favorited);
      setFavoriteCount(result.favorite_count);
    } catch (error) { showSuccess(error instanceof Error ? error.message : t('resourceDetail.favoriteFailed')); }
    setBusy(false);
  };

  const toggleLike = async () => {
    if (!isAuthenticated) { showSuccess(t('resourceDetail.likeSignIn')); return; }
    setBusy(true);
    try {
      const result = liked ? await resourceApi.removeLike(resource.id) : await resourceApi.addLike(resource.id);
      setLiked(result.is_liked);
      setLikeCount(result.like_count);
    } catch (error) { showSuccess(error instanceof Error ? error.message : t('resourceDetail.likeFailed')); }
    setBusy(false);
  };

  const toggleSubscription = async () => {
    if (!isAuthenticated) { showSuccess(t('resourceDetail.subscribeSignIn')); return; }
    setBusy(true);
    try {
      const result = subscribed ? await resourceApi.unsubscribe(resource.id) : await resourceApi.subscribe(resource.id);
      setSubscribed(result.is_subscribed);
      showSuccess(result.is_subscribed ? t('resourceDetail.subscribed') : t('resourceDetail.unsubscribed'));
    } catch (error) { showSuccess(error instanceof Error ? error.message : t('resourceDetail.subscribeFailed')); }
    setBusy(false);
  };

  const rate = async (value: number) => {
    if (!isAuthenticated) { showSuccess(t('resourceDetail.rateSignIn')); return; }
    try {
      await resourceApi.upsertRating(resource.id, value);
      setUserRating(value);
      showSuccess(t('resourceDetail.rated'));
    } catch (error) { showSuccess(error instanceof Error ? error.message : t('resourceDetail.rateFailed')); }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: resource.title, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* cancelled share */ }
  };

  return <div className="space-y-6 pb-16 lg:pb-0">
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
      <div>
        <div className="p-5 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row">
            <ResourceGallery title={resource.title} images={gallery} index={galleryIndex} contain={isMap || isSchematic} onSelect={setGalleryIndex} />
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
                {resource.category_name && <Link href={`/resources?category_id=${resource.category_id}`} className="text-[var(--primary)] hover:underline">{t('resourceDetail.category', { name: resource.category_name })}</Link>}
                {resource.resource_kind && <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{t(`resourceKinds.${resourceKind}`)}</span>}
                {(primaryVersion?.version || resource.version) && <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{t('resourceDetail.versionLabel', { version: primaryVersion?.version || resource.version || '' })}</span>}
                <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-[var(--text-secondary)]">{t(`resourceDetail.${statusKey}`)}</span>
              </div>
              <h1 className="min-w-0 break-words text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">{resource.title}</h1>
              <p className="mt-3 max-w-3xl line-clamp-3 text-base leading-7 text-[var(--text-secondary)]">{resource.description || t('resourceDetail.emptyDescription')}</p>
              {quickFacts.length > 0 && <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{quickFacts.map((fact) => <div key={fact.label} className="min-w-0 border-l-2 border-[var(--primary)]/40 pl-2.5"><dt className="text-xs text-[var(--text-muted)]">{t(`resourceKindDetails.fact.${RESOURCE_FACT_KEYS[fact.label] || 'resourceVersion'}`)}</dt><dd className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{fact.value}</dd></div>)}</dl>}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--text-muted)]">
                <Link href={`/users/${resource.user_id}`} className="inline-flex min-w-0 max-w-full items-center gap-2 hover:text-[var(--primary)]"><span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-elevated)]">{resource.avatar_url ? <img src={resource.avatar_url} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}</span><span className="min-w-0 break-all">{resource.username || t('resourceDetail.unknownAuthor')}</span></Link>
                <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" />{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(resource.updated_at || resource.created_at))} {t('resourceDetail.updated')}</span>
                <span className="inline-flex items-center gap-1"><Download className="h-4 w-4" />{t('resourceDetail.downloads', { count: new Intl.NumberFormat(locale).format(resource.download_count || 0) })}</span>
                <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" />{t('resourceDetail.views', { count: new Intl.NumberFormat(locale).format(viewCount) })}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">{displayTags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)]"><Tag className="h-3.5 w-3.5" />{tag}</span>)}</div>
              {resource.public_id && <Link href={resource.resource_kind === 'schematic' || resource.resource_kind === 'map' ? `/tools/${resource.resource_kind === 'schematic' ? 'blueprint-editor' : 'map-editor'}?resource=${encodeURIComponent(resource.public_id)}${selectedVersionPublicId ? `&version=${encodeURIComponent(selectedVersionPublicId)}` : ''}` : `/resources/${encodeURIComponent(resource.public_id)}/workbench`} aria-label={resource.resource_kind === 'schematic' ? t('tools.openBlueprintEditor') : resource.resource_kind === 'map' ? t('tools.openMapEditor') : t('resourceWorkbenchV2.openWorkbench')} className="mt-4 inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]"><Package className="h-4 w-4" />{resource.resource_kind === 'schematic' ? t('tools.openBlueprintEditor') : resource.resource_kind === 'map' ? t('tools.openMapEditor') : t('resourceWorkbenchV2.openWorkbench')}</Link>}
              {['map', 'schematic'].includes(resource.resource_kind || '') && resource.renderer_status !== 'ready' && <p className="mt-3 text-sm text-[var(--text-muted)]">{resource.renderer_status === 'processing' ? t('resourceDetail.rendererProcessing') : resource.renderer_status === 'failed' ? t('resourceDetail.rendererFailed') : t('resourceDetail.rendererUnavailable')}</p>}
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
            canManage={Boolean(user && (user.id === resource.user_id || user.role === 'admin' || user.role === 'moderator'))}
          />
        </div>

      </div>
    </section>

    <ResourceKindDetails resource={resource} selectedVersionPublicId={primaryVersion?.public_id || undefined} />

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <ResourceTabs resource={resource} selectedVersionPublicId={primaryVersion?.public_id || undefined} activeTab={activeTab} onChange={setActiveTab} downloadUrl={downloadUrl} commentCount={commentCount} onCommentCountChange={updateCommentCount} />
      <ResourceAside
        resource={resource}
        isMap={isMap}
        downloadUrl={downloadUrl}
        downloadLabel={downloadLabel}
        primaryVersionId={primaryVersion?.id}
        supportedVersions={displayedSupportedVersions}
        compatibility={displayedCompatibility}
        hideVersionSupport={isMap || isSchematic}
        isAuthenticated={isAuthenticated}
        userRating={userRating}
        checksum={primaryChecksum || null}
        onRate={rate}
        onCopyChecksum={copyChecksum}
      />
    </div>

    {related.length > 0 && <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-[var(--text)]">{t('resourceDetail.related')}</h2><Link href="/resources" className="text-sm text-[var(--primary)] hover:underline">{t('resourceDetail.browseMore')}</Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{related.map((item) => <Link key={item.id} href={`/resources/${item.slug ? `${item.id}-${item.slug}` : item.id}`} className="group rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--primary)]"><div className="flex gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]"><Package className="h-5 w-5" /></div><div className="min-w-0"><h3 className="truncate font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{item.title}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{t('resourceDetail.unknownDownloads', { author: item.username || t('resourceDetail.unknownAuthor'), count: new Intl.NumberFormat(locale).format(item.download_count || 0) })}</p></div></div></Link>)}</div></section>}
  </div>;
}
