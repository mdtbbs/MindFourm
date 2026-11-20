'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GitCompareArrows, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import {
  getResourceVisualDiff,
  type MapVisualDiffData,
  type MetadataOnlyVisualDiffData,
  type SchematicVisualDiffData,
  type VisualDiffKind,
  type VisualDiffResponse,
} from '@/lib/api/v1/resource-visual-diff';
import SchematicVisualDiff from './schematic-visual-diff';
import SchematicLogicPanel from './schematic-logic-panel';
import MapVisualDiff from './map-visual-diff';

/**
 * Version-pair comparison shell for Schematic and Map resources.
 *
 * A computing comparison is polled with the backend's `retry_after_ms` and a
 * bounded exponential backoff; every request and timer is torn down when the
 * selection changes or the component unmounts. A metadata-only answer is a
 * degraded result, not a canvas: only the file/metadata/dependency tables are
 * rendered in that state.
 */

export type VisualDiffVersion = {
  public_id?: string | null;
  version?: string | null;
};

type NormalizedVersion = { public_id: string; version: string | null };

type WorkbenchState =
  | { phase: 'loading' }
  | { phase: 'computing'; attempt: number }
  | { phase: 'error' }
  | { phase: 'ready'; result: VisualDiffResponse };

const NO_VERSIONS: VisualDiffVersion[] = [];
const MAX_RETRIES = 6;
const DEFAULT_RETRY_MS = 1_500;
const MAX_RETRY_MS = 5_000;

function normalizedVersions(versions: VisualDiffVersion[]): NormalizedVersion[] {
  return versions.flatMap((version) => (
    typeof version.public_id === 'string' && version.public_id
      ? [{ public_id: version.public_id, version: typeof version.version === 'string' && version.version ? version.version : null }]
      : []
  ));
}

function defaultSource(list: NormalizedVersion[], target: string | null): string | null {
  if (!list.length) return null;
  const index = target ? list.findIndex((version) => version.public_id === target) : 0;
  return list[index + 1]?.public_id ?? null;
}

function formatSize(value: number | null | undefined, locale: string, missing: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return missing;
  if (value < 1024) return `${new Intl.NumberFormat(locale).format(value)} B`;
  if (value < 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1024 / 1024 / 1024)} GB`;
}

function MetadataOnlyDiff({ diff }: { diff: MetadataOnlyVisualDiffData }) {
  const { t, locale } = useI18n();
  const missing = t('visualDiff.valueMissing');
  const file = diff.file_delta ?? null;
  const metadata = diff.metadata_delta ?? null;
  const dependencies = diff.dependencies_delta ?? null;
  const changed = t('visualDiff.changed');
  const unchanged = t('visualDiff.unchanged');
  const dependencyList = (values: string[] | undefined) => values && values.length ? values.join(', ') : t('visualDiff.none');
  return <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
    <div>
      <h4 className="text-sm font-semibold text-[var(--text)]">{t('visualDiff.metadataOnly.title')}</h4>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('visualDiff.metadataOnly.description')}</p>
      {diff.fallback_reason ? <p className="mt-1 text-xs text-[var(--text-muted)]">{t('visualDiff.metadataOnly.reason', { reason: diff.fallback_reason })}</p> : null}
    </div>
    <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[26rem] text-sm">
        <caption className="px-3 py-2 text-left font-semibold text-[var(--text)]">{t('visualDiff.metadataOnly.fileTitle')}</caption>
        <tbody>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.fileSizeFrom')}</th><td className="px-3 py-2 text-right text-[var(--text)]">{formatSize(file?.size_from, locale, missing)}</td></tr>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.fileSizeTo')}</th><td className="px-3 py-2 text-right text-[var(--text)]">{formatSize(file?.size_to, locale, missing)}</td></tr>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.shaChanged')}</th><td className="px-3 py-2 text-right text-[var(--text)]">{file?.sha256_changed ? changed : unchanged}</td></tr>
        </tbody>
      </table>
    </div>
    <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[26rem] text-sm">
        <caption className="px-3 py-2 text-left font-semibold text-[var(--text)]">{t('visualDiff.metadataOnly.metadataTitle')}</caption>
        <tbody>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.versionFrom')}</th><td className="px-3 py-2 text-right text-[var(--text)]">{metadata?.version_from ?? missing}</td></tr>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.versionTo')}</th><td className="px-3 py-2 text-right text-[var(--text)]">{metadata?.version_to ?? missing}</td></tr>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.gameBoundsChanged')}</th><td className="px-3 py-2 text-right text-[var(--text)]">{metadata?.game_version_bounds_changed ? changed : unchanged}</td></tr>
        </tbody>
      </table>
    </div>
    <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[26rem] text-sm">
        <caption className="px-3 py-2 text-left font-semibold text-[var(--text)]">{t('visualDiff.metadataOnly.dependenciesTitle')}</caption>
        <tbody>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.dependenciesAdded')}</th><td className="break-all px-3 py-2 text-right text-[var(--text)]">{dependencyList(dependencies?.added)}</td></tr>
          <tr className="border-t border-[var(--border)]"><th scope="row" className="px-3 py-2 text-left font-normal text-[var(--text-muted)]">{t('visualDiff.metadataOnly.dependenciesRemoved')}</th><td className="break-all px-3 py-2 text-right text-[var(--text)]">{dependencyList(dependencies?.removed)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>;
}

export default function VisualDiffWorkbench({
  resourcePublicId,
  resourceKind,
  toVersionPublicId,
  versions = NO_VERSIONS,
}: {
  resourcePublicId?: string | null;
  resourceKind?: string | null;
  toVersionPublicId?: string | null;
  versions?: VisualDiffVersion[];
}) {
  const { t } = useI18n();
  const headingId = useId();
  const kind: VisualDiffKind | null = resourceKind === 'schematic' ? 'schematic' : resourceKind === 'map' ? 'map' : null;
  const list = useMemo(() => normalizedVersions(versions), [versions]);
  const [targetVersion, setTargetVersion] = useState<string | null>(() => {
    const preferred = toVersionPublicId && list.some((version) => version.public_id === toVersionPublicId) ? toVersionPublicId : list[0]?.public_id ?? null;
    return preferred;
  });
  const [sourceVersion, setSourceVersion] = useState<string | null>(() => defaultSource(list, targetVersion));
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<WorkbenchState>({ phase: 'loading' });
  const selectionKey = list.map((version) => `${version.public_id}:${version.version ?? ''}`).join('|');
  const syncedSelection = useRef<string | null>(null);

  useEffect(() => {
    // A parent may hand over a new array with identical content; only a real
    // resource/version change may discard the reader's selection.
    const key = `${resourcePublicId ?? ''}|${resourceKind ?? ''}|${toVersionPublicId ?? ''}|${selectionKey}`;
    if (syncedSelection.current === key) return;
    syncedSelection.current = key;
    const preferred = toVersionPublicId && list.some((version) => version.public_id === toVersionPublicId) ? toVersionPublicId : list[0]?.public_id ?? null;
    setTargetVersion(preferred);
    setSourceVersion(defaultSource(list, preferred));
  }, [list, resourceKind, resourcePublicId, selectionKey, toVersionPublicId]);

  useEffect(() => {
    if (!kind || !resourcePublicId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    setState({ phase: 'loading' });
    const load = (retry: number) => {
      getResourceVisualDiff(resourcePublicId, kind, {
        toVersionPublicId: targetVersion,
        fromVersionPublicId: sourceVersion,
        signal: controller.signal,
      }).then((result) => {
        if (disposed) return;
        if (result.status === 'computing' && retry < MAX_RETRIES) {
          const requested = typeof result.retry_after_ms === 'number' && Number.isFinite(result.retry_after_ms) && result.retry_after_ms > 0
            ? result.retry_after_ms
            : DEFAULT_RETRY_MS;
          const delay = Math.min(MAX_RETRY_MS, requested * 2 ** retry);
          setState({ phase: 'computing', attempt: retry + 1 });
          timer = setTimeout(() => load(retry + 1), delay);
          return;
        }
        setState({ phase: 'ready', result });
      }).catch(() => {
        if (disposed || controller.signal.aborted) return;
        setState({ phase: 'error' });
      });
    };
    load(0);
    return () => {
      disposed = true;
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, [kind, reloadKey, resourcePublicId, sourceVersion, targetVersion]);

  const versionLabel = (publicId: string | null): string | null => {
    if (!publicId) return null;
    return list.find((version) => version.public_id === publicId)?.version ?? publicId.slice(0, 8);
  };

  const retry = () => setReloadKey((value) => value + 1);
  const changeTarget = (value: string) => {
    const next = value || null;
    setTargetVersion(next);
    setSourceVersion(defaultSource(list, next));
  };

  const result = state.phase === 'ready' ? state.result : null;
  const diff = result?.status === 'completed' ? result.diff : null;

  if (!kind || !resourcePublicId) return null;

  return <section id="resource-visual-diff" aria-labelledby={headingId} className="mb-6 space-y-3 border-b border-[var(--border)] pb-6">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id={headingId} className="flex items-center gap-2 text-base font-semibold text-[var(--text)]"><GitCompareArrows className="h-4 w-4 text-[var(--primary-text)]" />{t('visualDiff.title')}</h3>
      <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{t(kind === 'schematic' ? 'visualDiff.schematicTitle' : 'visualDiff.mapTitle')}</span>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1 text-sm text-[var(--text-secondary)]">
        <span>{t('visualDiff.selectors.fromLabel')}</span>
        <select value={sourceVersion ?? ''} onChange={(event) => setSourceVersion(event.target.value || null)} className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]">
          <option value="">{t('visualDiff.selectors.automaticFrom')}</option>
          {list.map((version) => <option key={version.public_id} value={version.public_id}>{version.version ?? version.public_id.slice(0, 8)}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm text-[var(--text-secondary)]">
        <span>{t('visualDiff.selectors.toLabel')}</span>
        <select value={targetVersion ?? ''} onChange={(event) => changeTarget(event.target.value)} className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]">
          <option value="">{t('visualDiff.selectors.automaticTo')}</option>
          {list.map((version) => <option key={version.public_id} value={version.public_id}>{version.version ?? version.public_id.slice(0, 8)}</option>)}
        </select>
      </label>
    </div>

    {kind === 'schematic' ? <SchematicLogicPanel resourcePublicId={resourcePublicId} versionPublicId={targetVersion || toVersionPublicId || null} /> : null}

    <div aria-live="polite" className="space-y-3">
      {state.phase === 'loading' ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('visualDiff.loading')}</p> : null}
      {state.phase === 'computing' ? <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>{t('visualDiff.computing')}</span>
        <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs">{t('visualDiff.computingProgress', { attempt: state.attempt, max: MAX_RETRIES })}</span>
      </div> : null}
      {state.phase === 'error' ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
        <span>{t('visualDiff.requestFailed')}</span>
        <button type="button" onClick={retry} className="min-h-11 rounded-md border border-current px-3">{t('visualDiff.retry')}</button>
      </div> : null}
      {result?.status === 'disabled' ? <p role="status" className="text-sm text-[var(--text-muted)]">{t('visualDiff.disabled')}</p> : null}
      {(result?.status === 'unavailable' || result?.status === 'failed') ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]">
        <span>{result?.status === 'failed' ? t('visualDiff.failed') : t('visualDiff.unavailable')}</span>
        <button type="button" onClick={retry} className="min-h-11 rounded-md border border-[var(--border)] px-3">{t('visualDiff.retry')}</button>
      </div> : null}
      {result?.status === 'computing' ? <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]">
        <span>{t('visualDiff.computing')}</span>
        <button type="button" onClick={retry} className="min-h-11 rounded-md border border-[var(--border)] px-3">{t('visualDiff.retry')}</button>
      </div> : null}
      {result?.status === 'metadata_only' ? <MetadataOnlyDiff diff={(result.diff ?? {}) as unknown as MetadataOnlyVisualDiffData} /> : null}
      {result?.status === 'completed' && !diff ? <p className="text-sm text-[var(--text-muted)]">{t('visualDiff.unavailable')}</p> : null}
      {result?.status === 'completed' && diff && kind === 'schematic' ? <SchematicVisualDiff
        resourcePublicId={resourcePublicId ?? ''}
        fromVersionPublicId={result.from_version_public_id}
        toVersionPublicId={result.to_version_public_id}
        fromVersionLabel={versionLabel(result.from_version_public_id)}
        toVersionLabel={versionLabel(result.to_version_public_id)}
        diff={diff as unknown as SchematicVisualDiffData}
      /> : null}
      {result?.status === 'completed' && diff && kind === 'map' ? <MapVisualDiff
        resourcePublicId={resourcePublicId ?? ''}
        fromVersionPublicId={result.from_version_public_id}
        toVersionPublicId={result.to_version_public_id}
        fromVersionLabel={versionLabel(result.from_version_public_id)}
        toVersionLabel={versionLabel(result.to_version_public_id)}
        diff={diff as unknown as MapVisualDiffData}
      /> : null}
    </div>
  </section>;
}
