'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getResourceWorkbenchV2KindTabData,
  type ResourceWorkbenchV2Kind,
  type ResourceWorkbenchV2KindTab,
  type ResourceWorkbenchV2KindTabData,
} from '@/lib/api/v1/resources';

type Tab = { key: ResourceWorkbenchV2KindTab; label: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function detailText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (depth >= 3) return '';
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => detailText(item, depth + 1)).filter(Boolean).join(' · ');
  }
  if (isRecord(value)) {
    return Object.entries(value).slice(0, 16).map(([key, item]) => {
      const rendered = detailText(item, depth + 1);
      return rendered ? `${key.replaceAll('_', ' ')}: ${rendered}` : '';
    }).filter(Boolean).join(' · ');
  }
  return '';
}

function hasDetails(value: Record<string, unknown> | null): boolean {
  return Boolean(value && Object.values(value).some((item) => detailText(item) !== ''));
}

function DetailRows({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return null;
  const rows = Object.entries(value).filter(([, item]) => detailText(item) !== '');
  if (!rows.length) return null;
  return <dl className="grid gap-2 sm:grid-cols-2">{rows.map(([key, item]) => <div key={key} className="min-w-0 rounded-lg bg-[var(--bg-elevated)] p-3">
    <dt className="text-xs capitalize text-[var(--text-muted)]">{key.replaceAll('_', ' ')}</dt>
    <dd className="mt-1 break-words text-sm text-[var(--text)]">{detailText(item)}</dd>
  </div>)}</dl>;
}

function rowTitle(row: Record<string, unknown>, tab: ResourceWorkbenchV2KindTab, index: number): string {
  const value = (...keys: string[]) => keys.map((key) => row[key]).find((item) => typeof item === 'string' && item.trim()) as string | undefined;
  if (tab === 'waves') {
    const start = row.wave_start;
    const end = row.wave_end;
    return start === end || end === null || end === undefined ? `Wave ${String(start ?? index + 1)}` : `Waves ${String(start)}–${String(end)}`;
  }
  if (tab === 'spawns') return value('spawn_type') || `Spawn ${index + 1}`;
  if (tab === 'cores') return value('core_type', 'team') || `Core ${index + 1}`;
  if (tab === 'logic') return value('processor_type') || `Processor ${index + 1}`;
  if (tab === 'resources' || tab === 'materials') return value('display_name', 'internal_name') || `Entry ${index + 1}`;
  if (tab === 'blocks') return value('display_name', 'internal_name') || `Block ${index + 1}`;
  return `Entry ${index + 1}`;
}

export default function ResourceKindDataWorkspace({
  publicId,
  kind,
  versionPublicId,
  labels,
}: {
  publicId: string;
  kind: ResourceWorkbenchV2Kind;
  versionPublicId: string | null;
  labels: Record<string, string>;
}) {
  const tabs: Tab[] = kind === 'map'
    ? [
      { key: 'rules', label: labels.rules },
      { key: 'resources', label: labels.resources },
      { key: 'spawns', label: labels.spawns },
      { key: 'cores', label: labels.cores },
      { key: 'waves', label: labels.waves },
    ]
    : [
      { key: 'blocks', label: labels.blocks },
      { key: 'materials', label: labels.materials },
      { key: 'production', label: labels.production },
      { key: 'logic', label: labels.logic },
    ];
  const [activeTab, setActiveTab] = useState<ResourceWorkbenchV2KindTab>(tabs[0].key);
  const [data, setData] = useState<ResourceWorkbenchV2KindTabData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const requestKey = `${publicId}:${kind}:${activeTab}:${versionPublicId || ''}`;
  const requestKeyRef = useRef(requestKey);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  requestKeyRef.current = requestKey;

  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    if (!versionPublicId) {
      setData(null);
      setLoading(false);
      setLoadingMore(false);
      setError('');
      return;
    }
    const requestedKey = requestKey;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setLoadingMore(false);
    setError('');
    void getResourceWorkbenchV2KindTabData(publicId, kind, activeTab, versionPublicId, undefined, { signal: controller.signal })
      .then((result) => { if (requestKeyRef.current === requestedKey) setData(result); })
      .catch((caught) => {
        if (!controller.signal.aborted && requestKeyRef.current === requestedKey) setError(caught instanceof Error ? caught.message : labels.loadFailed);
      })
      .finally(() => { if (!controller.signal.aborted && requestKeyRef.current === requestedKey) setLoading(false); });
    return () => {
      controller.abort();
      loadMoreControllerRef.current?.abort();
      loadMoreControllerRef.current = null;
    };
  }, [activeTab, kind, labels.loadFailed, publicId, reload, requestKey, versionPublicId]);

  const loadMore = async () => {
    const requestedVersion = versionPublicId;
    const requestedKey = requestKey;
    const cursor = data?.pagination.next_cursor;
    if (!requestedVersion || !cursor || loadingMore) return;
    setLoadingMore(true);
    setError('');
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    try {
      const page = await getResourceWorkbenchV2KindTabData(publicId, kind, activeTab, requestedVersion, cursor, { signal: controller.signal });
      if (requestKeyRef.current !== requestedKey) return;
      setData((current) => current ? { ...page, items: [...current.items, ...page.items] } : page);
    } catch (caught) {
      if (!controller.signal.aborted && requestKeyRef.current === requestedKey) setError(caught instanceof Error ? caught.message : labels.loadFailed);
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
        if (requestKeyRef.current === requestedKey) setLoadingMore(false);
      }
    }
  };

  const activeLabel = tabs.find((tab) => tab.key === activeTab)?.label || '';
  const summaryHasDetails = hasDetails(data?.summary || null);
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
    <div className="mb-4">
      <h3 className="text-base font-semibold text-[var(--text)]">{kind === 'map' ? labels.mapWorkspace : labels.schematicWorkspace}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{labels.versionScopedData}</p>
    </div>
    <div role="tablist" aria-label={kind === 'map' ? labels.mapWorkspace : labels.schematicWorkspace} className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {tabs.map(({ key, label }) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} className={`min-h-10 rounded-lg border px-3 text-left text-sm ${activeTab === key ? 'border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>{label}</button>)}
    </div>
    <div role="tabpanel" aria-label={activeLabel} className="space-y-4">
      {loading && <div role="status" className="rounded-lg bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">{labels.loading}</div>}
      {!loading && error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300"><p>{labels.loadFailed}: {error}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="mt-3 min-h-10 rounded-lg border border-[var(--border)] px-3 text-sm">{labels.retry}</button></div>}
      {!loading && !error && data && <>
        {summaryHasDetails && <DetailRows value={data.summary} />}
        {data.items.length ? <ul className="space-y-2">{data.items.map((row, index) => <li key={`${rowTitle(row, activeTab, index)}:${index}`} className="rounded-lg border border-[var(--border)] p-3">
          <h4 className="mb-2 break-words text-sm font-semibold text-[var(--text)]">{rowTitle(row, activeTab, index)}</h4>
          <DetailRows value={row} />
        </li>)}</ul> : !data.summary && <div className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">{labels.empty}</div>}
        {!data.items.length && data.summary && !summaryHasDetails && <div className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">{labels.empty}</div>}
        {data.pagination.has_more && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-10 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--primary)] disabled:opacity-60">{loadingMore ? labels.loadingMore : labels.loadMore}</button>}
      </>}
      {!versionPublicId && <div className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">{labels.noVersion}</div>}
    </div>
  </section>;
}
