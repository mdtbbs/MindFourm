'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Boxes,
  Cpu,
  ExternalLink,
  FileImage,
  GitCompareArrows,
  Loader2,
  Map as MapIcon,
  PenSquare,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useToastStore } from '@/store/toast-store';
import { safeUrl } from '@/lib/tiptap/presentation-url';
import {
  isResourceEmbedUuid,
  loadResourceEmbedCard,
  type ResourceEmbedCard as ResourceEmbedCardData,
} from '@/lib/api/v1/resource-embeds';

export type ResourceEmbedCardProps = {
  resourcePublicId: string;
  versionPublicId?: string | null;
  displayMode?: 'card';
  /** A read API may already have hydrated the card; when present no client read runs. */
  hydrated?: ResourceEmbedCardData | null;
};

type LoadState =
  | { status: 'loading'; card?: undefined }
  | { status: 'ready'; card: ResourceEmbedCardData }
  | { status: 'error'; card?: undefined };

function safeHttpUrl(value: unknown): string | null {
  const safe = safeUrl(value, false);
  if (!safe) return null;
  if (safe.startsWith('/') && !safe.startsWith('//')) return safe;
  try {
    const url = new URL(safe);
    return url.protocol === 'https:' || url.protocol === 'http:' ? safe : null;
  } catch {
    return null;
  }
}

function safeImageUrl(value: unknown): string | null {
  const safe = safeUrl(value, true);
  if (!safe) return null;
  if (safe.startsWith('/') && !safe.startsWith('//')) return safe;
  try {
    const url = new URL(safe);
    return url.protocol === 'https:' || url.protocol === 'http:' ? safe : null;
  } catch {
    return null;
  }
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Cookies belong to our own origin only; an external download URL gets none. */
function isSameOrigin(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (typeof window === 'undefined') return false;
  try {
    return new URL(value).origin === window.location.origin;
  } catch {
    return false;
  }
}

function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

function formatNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

function editorHref(base: string, resourcePublicId: string, versionPublicId: string | null): string {
  const params = new URLSearchParams({ resource: resourcePublicId });
  if (versionPublicId) params.set('version', versionPublicId);
  return `${base}?${params.toString()}`;
}

/** Chunked so a large blueprint cannot exceed the argument limit of `fromCharCode`. */
async function downloadSchematicBase64(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    credentials: isSameOrigin(url) ? 'include' : 'omit',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('download-failed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/**
 * Reader-facing resource card.
 *
 * Rendering is driven strictly by `status`: `available` may show the title,
 * preview, author and actions; `pending_review` is an author-only preview and
 * keeps the pending marker; `unavailable` shows a neutral placeholder and no
 * resource fields at all, even if a payload accidentally carries them.
 */
export function ResourceEmbedCard({
  resourcePublicId,
  versionPublicId = null,
  hydrated = null,
}: ResourceEmbedCardProps) {
  const { t, locale } = useI18n();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);
  const validId = isResourceEmbedUuid(resourcePublicId);
  const [loadState, setLoadState] = useState<LoadState>(() => (
    hydrated ? { status: 'ready', card: hydrated } : { status: 'loading' }
  ));
  const [reloadKey, setReloadKey] = useState(0);
  const [copying, setCopying] = useState(false);
  const copyAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!validId || hydrated) return;
    const controller = new AbortController();
    let active = true;
    setLoadState({ status: 'loading' });
    loadResourceEmbedCard(resourcePublicId, controller.signal)
      .then((card) => {
        if (active) setLoadState({ status: 'ready', card });
      })
      .catch((error) => {
        if (active && !isAbort(error)) setLoadState({ status: 'error' });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [hydrated, reloadKey, resourcePublicId, validId]);

  // A hydrated card that changes in place (a future read API) replaces the
  // client-loaded card without another request.
  useEffect(() => {
    if (hydrated) setLoadState({ status: 'ready', card: hydrated });
  }, [hydrated]);

  useEffect(() => () => {
    copyAbortRef.current?.abort();
  }, []);

  const shell = 'my-4 w-full min-w-0 overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]';
  const actionClass = 'inline-flex min-h-11 items-center gap-1.5 border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]';

  if (!validId) {
    return (
      <div className={`${shell} p-4`} data-testid="resource-embed-card" data-status="invalid" role="note">
        <strong className="block text-sm">{t('resourceEmbed.invalid.title')}</strong>
        <span className="mt-1 block text-sm text-[var(--text-muted)]">{t('resourceEmbed.invalid.description')}</span>
      </div>
    );
  }

  if (loadState.status === 'loading') {
    return (
      <div className={`${shell} flex min-h-11 items-center gap-2 p-4 text-sm text-[var(--text-muted)]`} data-testid="resource-embed-card" data-status="loading" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>{t('resourceEmbed.card.loading')}</span>
      </div>
    );
  }

  if (loadState.status === 'error') {
    return (
      <div className={`${shell} flex min-h-11 flex-wrap items-center gap-3 p-4 text-sm`} data-testid="resource-embed-card" data-status="error" role="alert">
        <span className="text-[var(--text-secondary)]">{t('resourceEmbed.card.loadFailed')}</span>
        <button
          type="button"
          className={actionClass}
          onClick={() => setReloadKey((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('resourceEmbed.card.retry')}
        </button>
      </div>
    );
  }

  const card = loadState.card;
  if (card.status !== 'available' && card.status !== 'pending_review') {
    return (
      <div className={`${shell} p-4`} data-testid="resource-embed-card" data-status="unavailable" role="status">
        <strong className="block text-sm">{t('resourceEmbed.card.unavailable')}</strong>
        <span className="mt-1 block text-sm text-[var(--text-muted)]">{t('resourceEmbed.card.unavailableHint')}</span>
      </div>
    );
  }

  const pending = card.status === 'pending_review';
  const kindKey = card.resource_kind === 'schematic' || card.resource_kind === 'map'
    || card.resource_kind === 'mod' || card.resource_kind === 'pack'
    ? card.resource_kind
    : 'resource';
  const title = card.title || (pending ? t('resourceEmbed.card.pendingUntitled') : t('resourceEmbed.card.untitled'));
  const resourceHref = safeHttpUrl(card.url) || `/resources/${encodeURIComponent(resourcePublicId)}`;
  const previewUrl = safeImageUrl(card.preview_url);
  const versionLabel = card.version ? t('resourceEmbed.card.version', { version: card.version }) : null;
  const pinnedVersion = versionPublicId || card.version_public_id;
  const schematic = card.resource_kind === 'schematic' ? card.schematic : null;
  const map = card.resource_kind === 'map' ? card.map : null;
  const materials = schematic && Array.isArray(schematic.top_materials)
    ? schematic.top_materials
      .filter((material) => material && typeof material.internal_name === 'string' && typeof material.amount === 'number')
      .slice(0, 4)
    : [];
  const dimensions = schematic
    ? (numberValue(schematic.width) !== null && numberValue(schematic.height) !== null
      ? `${numberValue(schematic.width)} × ${numberValue(schematic.height)}`
      : null)
    : map && numberValue(map.width) !== null && numberValue(map.height) !== null
      ? `${numberValue(map.width)} × ${numberValue(map.height)}`
      : null;

  const copyBlueprint = async () => {
    const downloadUrl = safeHttpUrl(card.download_url);
    if (!downloadUrl) {
      showError(t('resourceEmbed.card.copyUnavailable'));
      return;
    }
    copyAbortRef.current?.abort();
    const controller = new AbortController();
    copyAbortRef.current = controller;
    setCopying(true);
    try {
      const code = await downloadSchematicBase64(downloadUrl, controller.signal);
      if (!code.startsWith('bXNja')) throw new Error('not-schematic');
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(code);
      if (!controller.signal.aborted) showSuccess(t('resourceEmbed.card.copied'));
    } catch (error) {
      if (!isAbort(error)) {
        const message = error instanceof Error && error.message === 'not-schematic'
          ? t('resourceEmbed.card.copyNotSchematic')
          : error instanceof Error && error.message === 'clipboard-unavailable'
            ? t('resourceEmbed.card.copyUnavailable')
            : t('resourceEmbed.card.copyFailed');
        showError(message);
      }
    } finally {
      if (!controller.signal.aborted) setCopying(false);
    }
  };

  return (
    <article className={shell} data-testid="resource-embed-card" data-status={card.status}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row">
        {previewUrl ? (
          <a
            href={resourceHref}
            className="block shrink-0 overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] sm:w-40"
            aria-label={t('resourceEmbed.card.openResource')}
          >
            <img
              src={previewUrl}
              alt={t('resourceEmbed.card.previewAlt', { title })}
              loading="lazy"
              className="h-32 w-full object-contain sm:h-28"
            />
          </a>
        ) : (
          <div className="flex h-24 shrink-0 items-center justify-center border border-dashed border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] sm:w-40" aria-hidden="true">
            <FileImage className="h-7 w-7" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-[var(--text-secondary)]">
              {card.resource_kind === 'map' ? <MapIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <Boxes className="h-3.5 w-3.5" aria-hidden="true" />}
              {t(`resourceEmbed.kind.${kindKey}`)}
            </span>
            {versionLabel && <span className="text-[var(--text-muted)]">{versionLabel}</span>}
            {pending && (
              <span className="inline-flex items-center border border-[var(--primary)] bg-[var(--primary-soft)] px-2 py-0.5 font-medium text-[var(--primary-text)]">
                {t('resourceEmbed.card.pendingBadge')}
              </span>
            )}
          </div>

          <a
            href={resourceHref}
            className="flex min-h-11 items-center gap-1 text-base font-semibold text-[var(--text)] hover:text-[var(--primary-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <span className="min-w-0 break-words">{title}</span>
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>

          {card.author && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {card.author.avatar_url && safeImageUrl(card.author.avatar_url) && (
                <img
                  src={safeImageUrl(card.author.avatar_url) as string}
                  alt={t('resourceEmbed.card.authorAvatarAlt', { name: card.author.username })}
                  loading="lazy"
                  className="mr-1.5 inline-block h-5 w-5 rounded-full object-cover align-middle"
                />
              )}
              {t('resourceEmbed.card.by', { name: card.author.username })}
            </p>
          )}

          {pending && <p className="mt-2 text-sm text-[var(--text-muted)]">{t('resourceEmbed.card.pendingNotice')}</p>}

          {(dimensions || (schematic && numberValue(schematic.block_count) !== null)) && (
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
              {dimensions && (
                <div className="flex gap-1">
                  <dt className="text-[var(--text-muted)]">{t('resourceEmbed.card.dimensions')}:</dt>{' '}
                  <dd>{dimensions}</dd>
                </div>
              )}
              {schematic && numberValue(schematic.block_count) !== null && (
                <div className="flex gap-1">
                  <dt className="text-[var(--text-muted)]">{t('resourceEmbed.card.blocks')}:</dt>{' '}
                  <dd>{formatNumber(numberValue(schematic.block_count) as number, locale)}</dd>
                </div>
              )}
            </dl>
          )}

          {schematic && materials.length > 0 && (
            <div className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">{t('resourceEmbed.card.materials')}:</span>{' '}
              {materials.map((material, index) => (
                <span key={`${material.internal_name}-${index}`}>
                  {index > 0 ? ' · ' : ''}
                  {t('resourceEmbed.card.materialAmount', {
                    name: material.internal_name,
                    amount: formatNumber(material.amount, locale),
                  })}
                </span>
              ))}
            </div>
          )}

          {schematic?.power && (
            <div className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="text-[var(--text-muted)]">{t('resourceEmbed.card.power')}:</span>
                <span className="border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                  {t('resourceEmbed.card.estimated')}
                </span>
              </span>{' '}
              {numberValue(schematic.power.production) !== null && (
                <span>{t('resourceEmbed.card.powerProduction', { value: formatNumber(numberValue(schematic.power.production) as number, locale) })} </span>
              )}
              {numberValue(schematic.power.consumption) !== null && (
                <span>{t('resourceEmbed.card.powerConsumption', { value: formatNumber(numberValue(schematic.power.consumption) as number, locale) })} </span>
              )}
              {numberValue(schematic.power.net) !== null && (
                <span>{t('resourceEmbed.card.powerNet', { value: formatNumber(numberValue(schematic.power.net) as number, locale) })}</span>
              )}
            </div>
          )}

          {schematic?.has_logic && (
            <div className="mt-3 text-sm text-[var(--text-secondary)]">
              <Cpu className="mr-1 inline h-4 w-4" aria-hidden="true" />
              {t('resourceEmbed.card.logicBadge')}
              {numberValue(schematic.logic_processor_count) !== null && numberValue(schematic.logic_processor_count)! > 0
                ? ` (${formatNumber(numberValue(schematic.logic_processor_count) as number, locale)})`
                : ''}
            </div>
          )}

          {map && (
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
              {map.game_mode && <div><dt className="inline text-[var(--text-muted)]">{t('resourceEmbed.card.mode')}: </dt><dd className="inline">{map.game_mode}</dd></div>}
              {map.planet && <div><dt className="inline text-[var(--text-muted)]">{t('resourceEmbed.card.planet')}: </dt><dd className="inline">{map.planet}</dd></div>}
              {numberValue(map.wave_count) !== null && <div><dt className="inline text-[var(--text-muted)]">{t('resourceEmbed.card.waves')}: </dt><dd className="inline">{formatNumber(numberValue(map.wave_count) as number, locale)}</dd></div>}
              {numberValue(map.estimated_difficulty) !== null && (
                <div>
                  <dt className="inline text-[var(--text-muted)]">{t('resourceEmbed.card.estimatedDifficulty')}: </dt>
                  <dd className="inline">
                    {formatNumber(numberValue(map.estimated_difficulty) as number, locale)}
                    <span className="ml-1 border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">{t('resourceEmbed.card.estimated')}</span>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      {!pending && (
        <div role="group" aria-label={t('resourceEmbed.card.actions')} className="flex flex-wrap gap-2 border-t border-[var(--border)] p-3">
          {schematic && (
            <button type="button" className={actionClass} onClick={() => { void copyBlueprint(); }} disabled={copying}>
              {copying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
              {copying ? t('resourceEmbed.card.copying') : t('resourceEmbed.card.copySchematic')}
            </button>
          )}
          {schematic?.has_logic && (
            <a href={`/resources/${encodeURIComponent(resourcePublicId)}#logic`} className={actionClass}>
              <Cpu className="h-4 w-4" aria-hidden="true" />
              {t('resourceEmbed.card.viewLogic')}
            </a>
          )}
          {schematic && (
            <a href={editorHref('/tools/blueprint-editor', resourcePublicId, pinnedVersion)} className={actionClass}>
              <PenSquare className="h-4 w-4" aria-hidden="true" />
              {t('resourceEmbed.card.openBlueprintEditor')}
            </a>
          )}
          {map && (
            <a href={editorHref('/tools/map-editor', resourcePublicId, pinnedVersion)} className={actionClass}>
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              {t('resourceEmbed.card.openMapEditor')}
            </a>
          )}
          {(schematic || map) && (
            <a href={`/resources/${encodeURIComponent(resourcePublicId)}#updates`} className={actionClass}>
              <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
              {t('resourceEmbed.card.compareVersions')}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

export default ResourceEmbedCard;
