'use client';

import { useEffect, useId, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import type { ResourceV2VersionDiff } from '@/lib/api/v1/resources';

/**
 * Structured change summary for the release the reader is looking at.
 *
 * The stored diff payload is not safe to render as-is: it also carries
 * dependencies, game-version ranges, file hashes, raw manifests and analyzer
 * blobs, and `safePublicJson` does not strip those. Every reader here is an
 * explicit allowlist, and anything not named is dropped.
 */

const MAX_ROWS = 20;
const SUPPORTED_KINDS = ['mod', 'schematic', 'map'] as const;
type SupportedKind = (typeof SUPPORTED_KINDS)[number];

export type VersionChangeCacheEntry = { state: 'ready'; result: ResourceV2VersionDiff } | { state: 'error' };
export type VersionChangeCache = Map<string, VersionChangeCacheEntry>;

type VersionRef = { public_id?: string | null; version?: string | null };
type Labels = { t: (key: string, values?: Record<string, string | number>) => string; number: (value: number) => string };
type ChangeStatus = 'added' | 'removed' | 'changed' | 'renamed';
type SummaryEntry = { status: ChangeStatus; text: string };
type SummaryGroup = { id: string; entries: SummaryEntry[]; truncated: number; estimated: boolean };

/** Explicit group -> label mapping. Unknown ids never reach the catalog. */
const GROUP_LABEL_KEYS: Record<string, string> = {
  metadata: 'metadata',
  'content:block': 'contentBlock',
  'content:item': 'contentItem',
  'content:liquid': 'contentLiquid',
  'content:unit': 'contentUnit',
  'content:planet': 'contentPlanet',
  'content:techNode': 'contentTechNode',
  'content:other': 'contentOther',
  blocks: 'blocks',
  materials: 'materials',
  production: 'production',
  resources: 'resources',
  cores: 'cores',
  spawns: 'spawns',
  waves: 'waves',
};

const STATUS_LABEL_KEYS: Record<ChangeStatus, string> = {
  added: 'resourceChangeSummary.statusAdded',
  removed: 'resourceChangeSummary.statusRemoved',
  changed: 'resourceChangeSummary.statusChanged',
  renamed: 'resourceChangeSummary.statusRenamed',
};

function supportedKind(value: unknown): SupportedKind | null {
  return SUPPORTED_KINDS.includes(value as SupportedKind) ? value as SupportedKind : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).map(asRecord).filter((row): row is Record<string, unknown> => row !== null);
}

function asText(value: unknown, max = 160): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, max) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bounded(entries: SummaryEntry[]): { entries: SummaryEntry[]; truncated: number } {
  return { entries: entries.slice(0, MAX_ROWS), truncated: Math.max(0, entries.length - MAX_ROWS) };
}

function group(id: string, entries: SummaryEntry[], estimated = false): SummaryGroup | null {
  if (!entries.length) return null;
  return { id, ...bounded(entries), estimated };
}

function sectionEntries(
  diff: Record<string, unknown>,
  key: string,
  describe: (row: Record<string, unknown>) => string | null,
): SummaryEntry[] {
  const section = asRecord(diff[key]);
  if (!section) return [];
  const entries: SummaryEntry[] = [];
  for (const row of records(section.added)) {
    const text = describe(row);
    if (text) entries.push({ status: 'added', text });
  }
  for (const row of records(section.removed)) {
    const text = describe(row);
    if (text) entries.push({ status: 'removed', text });
  }
  for (const row of records(section.changed)) {
    const before = asRecord(row.before);
    const after = asRecord(row.after);
    const beforeText = before ? describe(before) : null;
    const afterText = after ? describe(after) : null;
    const text = beforeText && afterText ? `${beforeText} → ${afterText}` : beforeText || afterText;
    if (text) entries.push({ status: 'changed', text });
  }
  return entries;
}

/** `diff.metadata` is a change list, so a field is only read when it is named here. */
function metadataEntries(
  diff: Record<string, unknown>,
  fields: Record<string, string>,
  labels: Labels,
): SummaryEntry[] {
  const entries: SummaryEntry[] = [];
  for (const raw of records(diff.metadata)) {
    const field = asText(raw.field, 40);
    const labelKey = field ? fields[field] : undefined;
    if (!labelKey) continue;
    // Most fields are numeric, but map metadata also carries strings such as planet.
    const render = (value: unknown) => asNumber(value) !== null
      ? labels.number(asNumber(value)!)
      : asText(value, 60) || labels.t('resourceChangeSummary.unknownValue');
    const before = render(raw.before);
    const after = render(raw.after);
    if (before === after) continue;
    entries.push({
      status: 'changed',
      text: `${labels.t(`resourceChangeSummary.fields.${labelKey}`)}: ${before} → ${after}`,
    });
  }
  return entries;
}

const MOD_CONTENT_KINDS = ['block', 'item', 'liquid', 'unit', 'planet', 'techNode'] as const;

function modGroups(diff: Record<string, unknown>, labels: Labels): SummaryGroup[] {
  const byKind = new Map<string, SummaryEntry[]>();
  const name = (item: Record<string, unknown> | null) => item
    ? asText(item.display_name, 120) || asText(item.internal_name, 120)
    : null;
  for (const change of records(diff.content)) {
    const status = change.status as ChangeStatus | undefined;
    if (!status || !(status in STATUS_LABEL_KEYS)) continue;
    const rawKind = asText(change.content_type, 40);
    const kind = MOD_CONTENT_KINDS.includes(rawKind as (typeof MOD_CONTENT_KINDS)[number]) ? rawKind! : 'other';
    const before = name(asRecord(change.before));
    const after = name(asRecord(change.after));
    const text = status === 'renamed' || (status === 'changed' && before !== after)
      ? [before, after].filter(Boolean).join(' → ')
      : (status === 'removed' ? before : after) || before;
    if (!text) continue;
    const entries = byKind.get(kind) || [];
    entries.push({ status, text });
    byKind.set(kind, entries);
  }
  return [...MOD_CONTENT_KINDS, 'other']
    .map((kind) => group(`content:${kind}`, byKind.get(kind) || []))
    .filter((item): item is SummaryGroup => item !== null);
}

function schematicGroups(diff: Record<string, unknown>, labels: Labels): SummaryGroup[] {
  const line = (row: Record<string, unknown>) => {
    const item = asText(row.internal_name, 120) || asText(row.display_name, 120);
    if (!item) return null;
    const count = asNumber(row.count) ?? asNumber(row.amount);
    return count === null ? item : `${item} · ${labels.t('resourceChangeSummary.fields.count')} ${labels.number(count)}`;
  };
  const extras: SummaryEntry[] = [];
  const production = asRecord(diff.production);
  if (production && Object.keys(production).length) {
    extras.push({ status: 'changed', text: labels.t('resourceChangeSummary.fields.throughputChanged') });
  }
  const powerDelta = asNumber(diff.power_net_delta);
  if (powerDelta !== null && powerDelta !== 0) {
    extras.push({ status: 'changed', text: `${labels.t('resourceChangeSummary.fields.powerDelta')}: ${powerDelta > 0 ? '+' : ''}${labels.number(powerDelta)}` });
  }
  const logic = asRecord(diff.logic_processor_count);
  const logicBefore = asNumber(logic?.before);
  const logicAfter = asNumber(logic?.after);
  if (logicBefore !== null && logicAfter !== null && logicBefore !== logicAfter) {
    extras.push({ status: 'changed', text: `${labels.t('resourceChangeSummary.fields.logicProcessors')}: ${labels.number(logicBefore)} → ${labels.number(logicAfter)}` });
  }
  return [
    group('metadata', metadataEntries(diff, { width: 'width', height: 'height', block_count: 'blockCount' }, labels)),
    group('blocks', sectionEntries(diff, 'blocks', line)),
    group('materials', sectionEntries(diff, 'materials', line)),
    group('production', extras, true),
  ].filter((item): item is SummaryGroup => item !== null);
}

function mapGroups(diff: Record<string, unknown>, labels: Labels): SummaryGroup[] {
  const coordinates = (row: Record<string, unknown>) => {
    const x = asNumber(row.x);
    const y = asNumber(row.y);
    return x === null || y === null ? null : `(${x}, ${y})`;
  };
  const line = (join: (row: Record<string, unknown>) => (string | null)[]) =>
    (row: Record<string, unknown>) => join(row).filter(Boolean).join(' · ') || null;
  const resources = line((row) => [
    asText(row.resource_type, 40), asText(row.internal_name, 120),
    asNumber(row.amount) === null ? null : labels.number(asNumber(row.amount)!),
  ]);
  const cores = line((row) => [asText(row.core_type, 60), asText(row.team, 40), coordinates(row)]);
  const spawns = line((row) => [
    asText(row.spawn_type, 40), asText(row.team, 40), coordinates(row),
    asNumber(row.wave) === null ? null : `#${asNumber(row.wave)}`,
  ]);
  const waves = line((row) => {
    const start = asNumber(row.wave_start);
    const end = asNumber(row.wave_end);
    if (start === null && end === null) return [];
    const bosses = asNumber(row.boss_count);
    return [
      start !== null && end !== null && end > start ? `${start}–${end}` : String(start ?? end),
      asNumber(row.enemy_count) === null ? null : `${labels.t('resourceChangeSummary.fields.enemyCount')} ${labels.number(asNumber(row.enemy_count)!)}`,
      bosses ? `${labels.t('resourceChangeSummary.fields.bossCount')} ${labels.number(bosses)}` : null,
    ];
  });
  const metadata = metadataEntries(diff, {
    width: 'width', height: 'height', game_mode: 'gameMode', planet: 'planet',
    player_count: 'playerCount', playtime_seconds: 'playtimeSeconds',
  }, labels);
  if (records(diff.metadata).some((change) => asText(change.field, 40) === 'rules_json')) {
    metadata.push({ status: 'changed', text: labels.t('resourceChangeSummary.fields.rulesChanged') });
  }
  return [
    group('metadata', metadata),
    group('resources', sectionEntries(diff, 'resources', resources), true),
    group('cores', sectionEntries(diff, 'cores', cores)),
    group('spawns', sectionEntries(diff, 'spawns', spawns)),
    group('waves', sectionEntries(diff, 'waves', waves), true),
  ].filter((item): item is SummaryGroup => item !== null);
}

export default function ResourceVersionChangeSummary({
  resourcePublicId, resourceKind, toVersionPublicId, versions, cache,
}: {
  resourcePublicId?: string | null;
  resourceKind?: string | null;
  toVersionPublicId?: string | null;
  versions?: VersionRef[];
  cache: VersionChangeCache;
}) {
  const { t, locale } = useI18n();
  const headingId = useId();
  const kind = supportedKind(resourceKind);
  const cacheKey = kind && resourcePublicId && toVersionPublicId
    ? `${kind}:${resourcePublicId}:${toVersionPublicId}`
    : null;
  const [state, setState] = useState<VersionChangeCacheEntry | { state: 'loading' } | null>(
    cacheKey ? cache.get(cacheKey) ?? null : null,
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!cacheKey || !kind || !resourcePublicId || !toVersionPublicId) {
      setState(null);
      return;
    }
    const cached = cache.get(cacheKey);
    if (cached) {
      setState(cached);
      return;
    }
    const controller = new AbortController();
    setState({ state: 'loading' });
    // Imported on demand: the V1 resource client is heavy and only the Updates
    // tab needs it, so the detail page's first-load chunk stays untouched.
    void import('@/lib/api/v1/resources')
      .then(({ getResourceV2VersionDiff }) => getResourceV2VersionDiff(resourcePublicId, kind, toVersionPublicId, { signal: controller.signal }))
      .then((result) => {
        cache.set(cacheKey, { state: 'ready', result });
        setState({ state: 'ready', result });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        cache.set(cacheKey, { state: 'error' });
        setState({ state: 'error' });
      });
    return () => controller.abort();
  }, [attempt, cache, cacheKey, kind, resourcePublicId, toVersionPublicId]);

  if (!cacheKey || !kind) return null;

  const labels: Labels = { t, number: (value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value) };
  const versionLabel = (publicId: string | null | undefined) => {
    if (!publicId) return t('resourceChangeSummary.unknownValue');
    return asText(versions?.find((version) => version.public_id === publicId)?.version, 60)
      || t('resourceChangeSummary.unknownValue');
  };
  const result = state?.state === 'ready' ? state.result : null;
  const previous = result?.from_version_public_id || null;
  const target = result?.to_version_public_id || toVersionPublicId;
  const diff = result?.status === 'completed' ? asRecord(result.diff) : null;
  const groups = diff
    ? (kind === 'mod' ? modGroups(diff, labels) : kind === 'schematic' ? schematicGroups(diff, labels) : mapGroups(diff, labels))
    : [];

  return <section aria-labelledby={headingId} className="mb-6 border-b border-[var(--border)] pb-6">
    <h3 id={headingId} className="mb-3 text-base font-semibold text-[var(--text)]">{t('resourceChangeSummary.title')}</h3>
    {state?.state === 'loading' && <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceChangeSummary.loading')}</p>}
    {state?.state === 'error' && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
      <span>{t('resourceChangeSummary.loadFailed')}</span>
      <button type="button" onClick={() => { cache.delete(cacheKey); setAttempt((value) => value + 1); }} className="min-h-10 rounded-md border border-current px-3">{t('resourceChangeSummary.retry')}</button>
    </div>}
    {state?.state === 'ready' && !previous && <p className="text-sm text-[var(--text-muted)]">{t('resourceChangeSummary.firstVersion')}</p>}
    {state?.state === 'ready' && previous && !diff && <p className="text-sm text-[var(--text-muted)]">{t('resourceChangeSummary.unavailable')}</p>}
    {state?.state === 'ready' && diff && <>
      <p className="text-sm text-[var(--text-muted)]">{t('resourceChangeSummary.range', { from: versionLabel(previous), to: versionLabel(target) })}</p>
      {groups.length ? <div className="mt-3 space-y-2">{groups.map((item) => <details key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]">
        <summary className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text)]">
          <span>{t(`resourceChangeSummary.groups.${GROUP_LABEL_KEYS[item.id]}`)}</span>
          <span className="rounded-full bg-[var(--bg-card)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">{t('resourceChangeSummary.items', { count: new Intl.NumberFormat(locale).format(item.entries.length) })}</span>
          {item.estimated && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary-text)]">{t('resourceChangeSummary.estimated')}</span>}
        </summary>
        <ul className="space-y-1 px-3 pb-3 text-sm text-[var(--text-secondary)]">
          {item.entries.map((entry, index) => <li key={`${entry.status}:${index}:${entry.text}`} className="break-words">
            <span className="mr-2 text-xs text-[var(--text-muted)]">{t(STATUS_LABEL_KEYS[entry.status])}</span>
            {entry.text}
          </li>)}
        </ul>
        {item.truncated > 0 && <p className="px-3 pb-3 text-xs text-[var(--text-muted)]">{t('resourceChangeSummary.more', { count: new Intl.NumberFormat(locale).format(item.truncated) })}</p>}
      </details>)}</div> : <p className="mt-3 text-sm text-[var(--text-muted)]">{t('resourceChangeSummary.noChanges')}</p>}
      {groups.some((item) => item.estimated) && <p className="mt-2 text-xs text-[var(--text-muted)]">{t('resourceChangeSummary.estimateNote')}</p>}
      {kind === 'map' && <p className="mt-2 text-xs text-[var(--text-muted)]">{t('resourceChangeSummary.mapDisclaimer')}</p>}
    </>}
  </section>;
}
