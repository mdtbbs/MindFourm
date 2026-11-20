/**
 * Resource card embeds.
 *
 * Two independent contracts live here:
 *
 *  - The batch hydration read (`GET /api/v1/resources/embeds/cards`) used by the
 *    `resourceEmbed` Tiptap node. Several cards usually appear in one post, so
 *    reads are coalesced into one request per microtask/batch and cached briefly;
 *    a card never holds a request of its own.
 *  - The stateless blueprint analyzer + publish path used by the paste dialog.
 *    The analyzer is a legacy `/api/resources` endpoint that requires CSRF and
 *    returns raw parse metadata; publishing reuses the direct-upload V1 flow.
 */

import { buildPublicApiUrl } from '../client';
import { unwrapApiPayload } from '../response';
import { fetchV1 } from './transport';
import {
  createResourceDirectUploadDraft,
  uploadResourceDirectDraft,
} from './resource-direct-upload';

/** The schema (and the backend validator) cap embeds per document at ten. */
export const RESOURCE_EMBED_LIMIT = 10;
/** The hydration endpoint accepts at most ten ids per request. */
export const RESOURCE_EMBED_BATCH_SIZE = 10;
/** Cards change slowly; a short cache keeps repeated scrolls quiet. */
export const RESOURCE_EMBED_CACHE_TTL_MS = 60_000;

/** Public resource identifiers: the backend's RFC 4122 version/variant check. */
export const RESOURCE_EMBED_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isResourceEmbedUuid(value: unknown): value is string {
  return typeof value === 'string' && RESOURCE_EMBED_UUID_PATTERN.test(value);
}

export type ResourceEmbedAttrs = {
  resourcePublicId: string;
  versionPublicId: string | null;
  displayMode: 'card';
};

/**
 * Strict value check shared by the editor command and the node view.
 *
 * A document that carries an unknown display mode or a malformed id is not
 * "rendered as best effort": the card view shows an explicit placeholder so a
 * bad value never silently turns into a different resource.
 */
export function isValidResourceEmbedAttrs(value: unknown): value is ResourceEmbedAttrs {
  if (!value || typeof value !== 'object') return false;
  const attrs = value as Record<string, unknown>;
  const version = attrs.versionPublicId;
  return isResourceEmbedUuid(attrs.resourcePublicId)
    && (version === null || version === undefined || isResourceEmbedUuid(version))
    && attrs.displayMode === 'card';
}

export type ResourceEmbedCardStatus = 'available' | 'pending_review' | 'unavailable';
export type ResourceEmbedKind = 'schematic' | 'map' | 'mod' | 'pack';

export type ResourceEmbedCard = {
  resource_public_id: string;
  version_public_id: string | null;
  status: ResourceEmbedCardStatus;
  resource_kind: ResourceEmbedKind | null;
  title: string | null;
  summary: string | null;
  url: string | null;
  preview_url: string | null;
  download_url: string | null;
  author: { id: number; username: string; avatar_url: string | null } | null;
  version: string | null;
  schematic: null | {
    width: number | null;
    height: number | null;
    block_count: number | null;
    top_materials: Array<{ internal_name: string; amount: number }>;
    power: null | {
      production: number | null;
      consumption: number | null;
      net: number | null;
      estimated: true;
    };
    has_logic: boolean;
    logic_processor_count: number;
  };
  map: null | {
    width: number | null;
    height: number | null;
    game_mode: string | null;
    planet: string | null;
    wave_count: number | null;
    estimated_difficulty: number | null;
  };
  reason: string | null;
};

export type SchematicPasteBlock = {
  internal_name: string;
  display_name: string | null;
  count: number;
  positions: unknown[];
};

export type SchematicPasteAnalysis = {
  resource_kind: 'schematic';
  metadata: Record<string, unknown> | null;
  parser_version: string | null;
  blocks: SchematicPasteBlock[];
  preview_data_url: string | null;
};

function unavailableCard(resourcePublicId: string, reason: string | null = null): ResourceEmbedCard {
  return {
    resource_public_id: resourcePublicId,
    version_public_id: null,
    status: 'unavailable',
    resource_kind: null,
    title: null,
    summary: null,
    url: null,
    preview_url: null,
    download_url: null,
    author: null,
    version: null,
    schematic: null,
    map: null,
    reason,
  };
}

/**
 * Never let a wrongly-shaped response leak content from a non-visible status.
 *
 * The backend already nulls these for `unavailable`/foreign `pending_review`
 * rows; this is the client-side half of "render strictly by status" so a proxy,
 * a future server regression, or a hydrated prop cannot show a title the reader
 * is not allowed to see.
 */
function normalizeCard(item: Partial<ResourceEmbedCard> | null | undefined, fallbackId: string): ResourceEmbedCard {
  const id = isResourceEmbedUuid(item?.resource_public_id) ? item.resource_public_id : fallbackId;
  const status: ResourceEmbedCardStatus =
    item?.status === 'available' || item?.status === 'pending_review' ? item.status : 'unavailable';
  if (status === 'unavailable') return unavailableCard(id, typeof item?.reason === 'string' ? item.reason : null);
  return {
    resource_public_id: id,
    version_public_id: isResourceEmbedUuid(item?.version_public_id) ? item.version_public_id : null,
    status,
    resource_kind: item?.resource_kind === 'schematic' || item?.resource_kind === 'map'
      || item?.resource_kind === 'mod' || item?.resource_kind === 'pack' ? item.resource_kind : null,
    title: typeof item?.title === 'string' && item.title.trim() ? item.title : null,
    summary: typeof item?.summary === 'string' ? item.summary : null,
    url: typeof item?.url === 'string' ? item.url : null,
    preview_url: typeof item?.preview_url === 'string' ? item.preview_url : null,
    download_url: typeof item?.download_url === 'string' ? item.download_url : null,
    author: item?.author && Number.isSafeInteger(item.author.id) && typeof item.author.username === 'string'
      ? {
        id: item.author.id,
        username: item.author.username,
        avatar_url: typeof item.author.avatar_url === 'string' ? item.author.avatar_url : null,
      }
      : null,
    version: typeof item?.version === 'string' && item.version.trim() ? item.version : null,
    schematic: item?.schematic ?? null,
    map: item?.map ?? null,
    reason: typeof item?.reason === 'string' ? item.reason : null,
  };
}

/** One batch read; callers are expected to pre-chunk to `RESOURCE_EMBED_BATCH_SIZE`. */
export async function fetchResourceEmbedCards(
  ids: readonly string[],
  options: { signal?: AbortSignal } = {},
): Promise<ResourceEmbedCard[]> {
  const unique = Array.from(new Set(ids.filter(isResourceEmbedUuid))).slice(0, RESOURCE_EMBED_BATCH_SIZE);
  if (!unique.length) return [];
  const query = unique.map((id) => encodeURIComponent(id)).join(',');
  const result = await fetchV1<{ items?: Partial<ResourceEmbedCard>[] }>(
    `/resources/embeds/cards?ids=${query}`,
    { signal: options.signal, init: { cache: 'no-store' } },
  );
  const items = Array.isArray(result?.items) ? result.items : [];
  const byId = new Map<string, Partial<ResourceEmbedCard>>();
  for (const item of items) {
    if (item && isResourceEmbedUuid(item.resource_public_id)) byId.set(item.resource_public_id, item);
  }
  return unique.map((id) => {
    const item = byId.get(id);
    return item ? normalizeCard(item, id) : unavailableCard(id, 'not_found');
  });
}

type CachedCard = { card: ResourceEmbedCard; expiresAt: number };

const cardCache = new Map<string, CachedCard>();

type Waiter = {
  id: string;
  signal?: AbortSignal;
  aborted: boolean;
  finish: (card: ResourceEmbedCard) => void;
  fail: (error: unknown) => void;
};

let queue: Waiter[] = [];
let flushScheduled = false;

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function readCache(id: string): ResourceEmbedCard | null {
  const cached = cardCache.get(id);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cardCache.delete(id);
    return null;
  }
  return cached.card;
}

/** Tests (and a manual "refresh" action) may clear the shared card cache. */
export function clearResourceEmbedCache(): void {
  cardCache.clear();
}

export function loadResourceEmbedCard(resourcePublicId: string, signal?: AbortSignal): Promise<ResourceEmbedCard> {
  const cached = readCache(resourcePublicId);
  if (cached) return Promise.resolve(cached);
  if (signal?.aborted) return Promise.reject(abortError());
  if (!isResourceEmbedUuid(resourcePublicId)) return Promise.resolve(unavailableCard(resourcePublicId));

  return new Promise<ResourceEmbedCard>((resolve, reject) => {
    let settled = false;
    const waiter: Waiter = {
      id: resourcePublicId,
      signal,
      aborted: false,
      finish: (card) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(card);
      },
      fail: (error) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    };
    const onAbort = () => {
      waiter.aborted = true;
      waiter.fail(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    queue.push(waiter);
    scheduleFlush();
  });
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void flushQueue();
  });
}

async function flushQueue(): Promise<void> {
  // Up to ten distinct ids, while consuming any duplicates that sit in between.
  const groups = new Map<string, Waiter[]>();
  let consumed = 0;
  while (consumed < queue.length && groups.size < RESOURCE_EMBED_BATCH_SIZE) {
    const waiter = queue[consumed];
    consumed += 1;
    if (waiter.aborted) continue;
    const existing = groups.get(waiter.id);
    if (existing) existing.push(waiter);
    else groups.set(waiter.id, [waiter]);
  }
  queue = queue.slice(consumed);
  if (queue.length) scheduleFlush();

  const entries = [...groups.entries()];
  if (!entries.length) return;
  const waiters = entries.flatMap(([, group]) => group).filter((waiter) => !waiter.aborted);
  if (!waiters.length) return;

  const controller = new AbortController();
  const abortWhenEveryWaiterLeft = () => {
    if (waiters.every((waiter) => waiter.aborted)) controller.abort();
  };
  for (const waiter of waiters) waiter.signal?.addEventListener('abort', abortWhenEveryWaiterLeft, { once: true });

  try {
    const cards = await fetchResourceEmbedCards(entries.map(([id]) => id), { signal: controller.signal });
    const byId = new Map(cards.map((card) => [card.resource_public_id, card]));
    const expiresAt = Date.now() + RESOURCE_EMBED_CACHE_TTL_MS;
    for (const [id, group] of entries) {
      const card = byId.get(id) ?? unavailableCard(id, 'not_found');
      cardCache.set(id, { card, expiresAt });
      for (const waiter of group) {
        if (!waiter.aborted) waiter.finish(card);
      }
    }
  } catch (error) {
    const aborted = Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
    if (!aborted) {
      for (const [, group] of entries) {
        for (const waiter of group) {
          if (!waiter.aborted) waiter.fail(error);
        }
      }
    }
  } finally {
    for (const waiter of waiters) waiter.signal?.removeEventListener('abort', abortWhenEveryWaiterLeft);
  }
}

function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const pair = document.cookie.split('; ').find((item) => item.startsWith('csrf_token='));
  if (!pair) return undefined;
  return decodeURIComponent(pair.slice('csrf_token='.length));
}

function csrfHeader(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { 'X-CSRF-Token': token } : {};
}

async function ensureCsrfCookie(signal?: AbortSignal): Promise<void> {
  if (readCsrfToken() || typeof window === 'undefined') return;
  await fetch(buildPublicApiUrl('/api/auth/check'), { credentials: 'include', signal }).catch(() => undefined);
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const nested = record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>).message
      : undefined;
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof nested === 'string' && nested) return nested;
  }
  return fallback;
}

/**
 * Analyze pasted blueprint bytes for the publish preview.
 *
 * `include_preview=1` is what makes the endpoint return the rendered PNG; the
 * returned metadata is display data only and is never written into the node.
 */
export async function analyzeSchematicPaste(
  bytes: Uint8Array,
  options: { signal?: AbortSignal } = {},
): Promise<SchematicPasteAnalysis> {
  const body = new FormData();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  body.append('file', new File([buffer], 'pasted.msch', { type: 'application/octet-stream' }));
  await ensureCsrfCookie(options.signal);

  const send = () => fetch(buildPublicApiUrl('/api/resources/editor/schematic/analyze?include_preview=1'), {
    method: 'POST',
    credentials: 'include',
    headers: csrfHeader(),
    body,
    signal: options.signal,
  });

  let response = await send();
  if (response.status === 403) {
    // A concurrent first request may have issued a newer CSRF cookie after the
    // header was read. This operation is stateless, so one retry is safe.
    const failure = await response.clone().json().catch(() => null);
    if (errorMessageFromPayload(failure, '') === 'CSRF token invalid') response = await send();
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    // Prefer the server's explanation (it knows whether the renderer is down or
    // the file is invalid); a stable code lets the dialog use its own copy.
    throw new Error(errorMessageFromPayload(failure, 'RESOURCE_EMBED_ANALYZE_FAILED'));
  }
  const payload = await response.json().catch(() => null);
  const data = unwrapApiPayload<Partial<SchematicPasteAnalysis>>(payload);
  if (!data || typeof data !== 'object') throw new Error('RESOURCE_EMBED_ANALYZE_FAILED');
  const blocks = Array.isArray(data.blocks)
    ? data.blocks.filter((block): block is SchematicPasteBlock => Boolean(
      block && typeof block.internal_name === 'string' && typeof block.count === 'number',
    )).map((block) => ({
      internal_name: block.internal_name,
      display_name: typeof block.display_name === 'string' ? block.display_name : null,
      count: block.count,
      positions: Array.isArray(block.positions) ? block.positions : [],
    }))
    : [];
  return {
    resource_kind: 'schematic',
    metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : null,
    parser_version: typeof data.parser_version === 'string' ? data.parser_version : null,
    blocks,
    preview_data_url: typeof data.preview_data_url === 'string' ? data.preview_data_url : null,
  };
}

export type PublishSchematicInput = {
  file: File;
  title: string;
  version?: string | null;
  categoryId?: number | null;
  onStage?: (stage: 'creating' | 'uploading') => void;
};

export type PublishedSchematic = {
  resourcePublicId: string;
  versionPublicId: string;
};

/** Create the public schematic resource, then upload its bytes through RES. */
export async function publishSchematicAsResource(input: PublishSchematicInput): Promise<PublishedSchematic> {
  input.onStage?.('creating');
  const draft = await createResourceDirectUploadDraft({
    title: input.title.trim(),
    resource_type: 'upload',
    resource_kind: 'schematic',
    content_language: 'unknown',
    version: input.version?.trim() || '1.0',
    ...(input.categoryId ? { category_id: input.categoryId } : {}),
    is_public: 1,
  }, crypto.randomUUID());

  let versionPublicId = draft.version_public_id;
  if (draft.draft_status === 'open') {
    input.onStage?.('uploading');
    const completion = await uploadResourceDirectDraft(draft.version_public_id, input.file);
    versionPublicId = completion.version_public_id ?? draft.version_public_id;
  }

  return { resourcePublicId: draft.resource_public_id, versionPublicId };
}

export type ResourceCategoryOption = {
  id: number;
  name: string;
  is_active: boolean;
};

/**
 * Public resource categories for the paste dialog's optional selector.
 *
 * This is the legacy read (not V1) because the selector mirrors the upload
 * form; it deliberately takes an AbortSignal so closing the panel cancels it.
 */
export async function fetchResourceCategories(signal?: AbortSignal): Promise<ResourceCategoryOption[]> {
  const response = await fetch(buildPublicApiUrl('/api/resources/categories'), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error('RESOURCE_EMBED_CATEGORY_FAILED');
  const payload = await response.json().catch(() => null);
  const data = unwrapApiPayload<ResourceCategoryOption[]>(payload);
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is ResourceCategoryOption => Boolean(
    item && Number.isSafeInteger(item.id) && typeof item.name === 'string' && item.is_active,
  ));
}
