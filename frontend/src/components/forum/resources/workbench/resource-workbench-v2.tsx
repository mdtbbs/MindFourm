'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertCircle, Boxes, Check, ChevronDown, CircleHelp, FileArchive, Map, Package,
  Puzzle, RefreshCw, Settings2, Shield, Users,
} from 'lucide-react';
import {
  getResourceV2VersionDiff,
  getResourceWorkbenchV2Analysis,
  getResourceWorkbenchV2ModContents,
  getResourceWorkbenchV2ModIndex,
  getResourceWorkbenchV2,
  type ResourceWorkbenchV2Analysis,
  type ResourceWorkbenchV2File,
  type ResourceWorkbenchV2Localization,
  type ResourceWorkbenchV2ModContent,
  type ResourceWorkbenchV2Page,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
  type ResourceV2VersionDiff,
  type V1ResourceMetadata,
} from '@/lib/api/v1/resources';
import { V1ApiError } from '@/lib/api/v1/transport';
import { useI18n } from '@/i18n/provider';
import ResourcePreviewViewer from './resource-preview-viewer';
import ResourceProfileEditor from './resource-profile-editor';
import ResourceReleaseForm from './resource-release-form';
import ResourceCommunityInteractions from './resource-community-interactions';
import SchematicLightEditor from './schematic-light-editor';

type SectionKey = 'overview' | 'publish' | 'compatibility' | 'analysis' | 'community' | 'settings';
type VersionTab = 'summary' | 'files' | 'compatibility' | 'diff';

const SECTION_ICONS = {
  overview: Package,
  publish: FileArchive,
  compatibility: Shield,
  analysis: Activity,
  community: Users,
  settings: Settings2,
} satisfies Record<SectionKey, typeof Package>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function displayDetailsValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  const scalar = displayValue(value);
  if (scalar) return scalar;
  if (depth >= 2) return '';
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => displayDetailsValue(item, depth + 1)).filter(Boolean);
    return `${items.join(' · ')}${value.length > 20 ? ' …' : ''}`;
  }
  if (isRecord(value)) {
    return Object.entries(value).slice(0, 20).map(([key, item]) => {
      const text = displayDetailsValue(item, depth + 1);
      return text ? `${key}: ${text}` : '';
    }).filter(Boolean).join(' · ');
  }
  return '';
}

function SummaryRows({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return null;
  const rows = Object.entries(value).filter(([, item]) => displayDetailsValue(item) !== '');
  if (rows.length === 0) return null;
  return <dl className="grid gap-2 sm:grid-cols-2">{rows.map(([key, item]) => <div key={key} className="min-w-0 rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{key.replaceAll('_', ' ')}</dt><dd className="mt-1 break-words text-sm text-[var(--text)]">{displayDetailsValue(item)}</dd></div>)}</dl>;
}

function FoldCard({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return <details open={open} className="group rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-[var(--text)] [&::-webkit-details-marker]:hidden">
      <span>{title}</span><ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-[var(--border)] p-4">{children}</div>
  </details>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">{children}</div>;
}

function formatDate(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

function formatSize(value: number | null, fallback: string): string {
  if (value === null || !Number.isFinite(value) || value < 0) return fallback;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({ file, labels }: { file: ResourceWorkbenchV2File; labels: Record<string, string> }) {
  const name = file.display_name || file.original_filename || file.public_id;
  return <li key={file.public_id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <FileArchive className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
      <div className="min-w-0">
        <p className="break-all text-sm font-medium text-[var(--text)]">{name}</p>
        <p className="mt-1 break-words text-xs text-[var(--text-muted)]">{file.role} · {file.delivery_mode} · {formatSize(file.size_bytes, labels.unknown)} · {file.integrity_status}</p>
      </div>
    </div>
    {file.downloadable && file.download_url
      ? <a href={file.download_url} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded border border-[var(--border)] px-3 text-sm text-[var(--primary)] hover:bg-[var(--primary-soft)]">{labels.download}</a>
      : <span className="inline-flex min-h-10 shrink-0 items-center justify-center rounded border border-[var(--border)] px-3 text-sm text-[var(--text-muted)]">{labels.unavailable}</span>}
  </li>;
}

function AnalysisPanel({ analysis, loading, error, labels }: { analysis: ResourceWorkbenchV2Analysis | null; loading: boolean; error: string; labels: Record<string, string> }) {
  if (loading) return <div role="status" className="rounded-lg bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">{labels.analysisLoading}</div>;
  if (error) return <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">{labels.analysisLoadFailed}: {error}</div>;
  if (!analysis) return <EmptyState>{labels.analysisEmpty}</EmptyState>;
  const severityTone: Record<string, string> = {
    ERROR: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    WARNING: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    INFO: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{analysis.kind}</span>
      <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{analysis.status}</span>
      {analysis.parser_version && <span className="text-xs text-[var(--text-muted)]">{labels.parser}: {analysis.parser_version}</span>}
    </div>
    <SummaryRows value={analysis.summary} />
    {analysis.data && <KindAnalysisDetails analysis={analysis} labels={labels} />}
    {analysis.findings.length ? <ul className="space-y-2">{analysis.findings.map((finding, index) => <li key={`${finding.key}:${finding.timestamp || index}`} className={`rounded-lg border p-3 ${severityTone[finding.severity] || severityTone.INFO}`}>
      <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-bold tracking-wide">{finding.severity}</span>{finding.ignored && <span className="rounded bg-black/5 px-1.5 py-0.5 text-[11px]">{labels.ignored}</span>}{finding.field_path && <code className="break-all text-xs">{finding.field_path}</code>}</div>
      <p className="mt-1 text-sm">{finding.message}</p>
      {finding.ignore_reason && <p className="mt-1 text-xs opacity-80">{finding.ignore_reason}</p>}
    </li>)}</ul> : <EmptyState>{labels.noFindings}</EmptyState>}
  </div>;
}

function KindAnalysisDetails({ analysis, labels }: { analysis: ResourceWorkbenchV2Analysis; labels: Record<string, string> }) {
  const data = analysis.data || {};
  if (analysis.kind === 'mod') {
    const manifest = recordValue(data.manifest);
    return <section aria-label={labels.kindAnalysis} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
      <h3 className="font-semibold text-[var(--text)]">{labels.modAnalysisDetails}</h3>
      <SummaryRows value={{ indexed_content_count: data.indexed_content_count, localization_count: data.localization_count, ...manifest }} />
    </section>;
  }
  if (analysis.kind === 'schematic') {
    const production = recordValue(data.production);
    const bottlenecks = Array.isArray(data.bottlenecks) ? data.bottlenecks : [];
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    return <section aria-label={labels.kindAnalysis} className="space-y-4 rounded-xl border border-[var(--border)] p-4">
      <h3 className="font-semibold text-[var(--text)]">{labels.schematicAnalysis}</h3>
      <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{labels.productionEstimate}</span><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{data.estimated === false ? labels.measured : labels.estimated}</span><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{data.available === true ? labels.available : labels.unavailable}</span></div>
      {production && <SummaryRows value={production} />}
      {bottlenecks.length > 0 && <DetailList title={labels.bottlenecks} values={bottlenecks} />}
      {warnings.length > 0 && <DetailList title={labels.analysisWarnings} values={warnings} />}
    </section>;
  }
  if (analysis.kind !== 'map') return null;
  const balance = recordValue(data.resource_balance);
  const path = recordValue(data.path_analysis);
  const waves = Array.isArray(data.waves) ? data.waves : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  return <section aria-label={labels.kindAnalysis} className="space-y-4 rounded-xl border border-[var(--border)] p-4">
    <h3 className="font-semibold text-[var(--text)]">{labels.mapAnalysis}</h3>
    <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{labels.difficulty}: {displayValue(data.estimated_difficulty) || labels.unknown}</span><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{labels.confidence}: {displayValue(data.difficulty_confidence) || labels.unknown}</span><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{labels.estimated}</span></div>
    {balance && <div><h4 className="mb-2 text-sm font-semibold text-[var(--text)]">{labels.resourceBalance}</h4><SummaryRows value={balance} /></div>}
    {path && <div><h4 className="mb-2 text-sm font-semibold text-[var(--text)]">{labels.pathAnalysis}</h4><SummaryRows value={path} /></div>}
    {waves.length > 0 && <DetailList title={labels.waves} values={waves} />}
    {warnings.length > 0 && <DetailList title={labels.analysisWarnings} values={warnings} />}
  </section>;
}

function DetailList({ title, values }: { title: string; values: unknown[] }) {
  const shown = values.slice(0, 20);
  return <div><h4 className="mb-2 text-sm font-semibold text-[var(--text)]">{title}</h4><ul className="space-y-2">{shown.map((value, index) => <li key={`${displayDetailsValue(value)}:${index}`} className="break-words rounded-lg bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]">{displayDetailsValue(value)}</li>)}</ul>{values.length > shown.length && <p className="mt-2 text-xs text-[var(--text-muted)]">{values.length - shown.length} …</p>}</div>;
}

function ModDetails({ data, analysis, publicId, versionPublicId, parserVersion, labels }: { data: Record<string, unknown> | undefined; analysis: ResourceWorkbenchV2Analysis | null; publicId: string; versionPublicId: string | null; parserVersion: string | null; labels: Record<string, string> }) {
  const versionRef = useRef(versionPublicId);
  versionRef.current = versionPublicId;
  const [contents, setContents] = useState<ResourceWorkbenchV2ModContent[]>([]);
  const [localizations, setLocalizations] = useState<ResourceWorkbenchV2Localization[]>([]);
  const [contentPagination, setContentPagination] = useState<ResourceWorkbenchV2Page<ResourceWorkbenchV2ModContent>['pagination']>({ next_cursor: null, has_more: false });
  const [indexLoading, setIndexLoading] = useState(Boolean(versionPublicId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [indexError, setIndexError] = useState('');
  const modId = displayValue(data?.mod_id);
  const version = displayValue(data?.version);
  const gameVersions = Array.isArray(data?.game_versions) ? data.game_versions.filter((item): item is string => typeof item === 'string') : [];
  const dependencies = Array.isArray(data?.dependencies) ? data.dependencies : [];
  const analysisData = analysis?.data || null;
  const manifest = recordValue(analysisData?.manifest);

  useEffect(() => {
    if (!versionPublicId) {
      setContents([]);
      setLocalizations([]);
      setContentPagination({ next_cursor: null, has_more: false });
      setIndexLoading(false);
      setLoadingMore(false);
      setIndexError('');
      return;
    }
    const controller = new AbortController();
    setIndexLoading(true);
    setLoadingMore(false);
    setIndexError('');
    void getResourceWorkbenchV2ModIndex(publicId, versionPublicId, { signal: controller.signal })
      .then((result) => {
        setContents(result.contents.items);
        setLocalizations(result.localizations.items);
        setContentPagination(result.contents.pagination);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setIndexError(caught instanceof Error ? caught.message : labels.indexLoadFailed);
      })
      .finally(() => { if (!controller.signal.aborted) setIndexLoading(false); });
    return () => controller.abort();
  }, [labels.indexLoadFailed, publicId, versionPublicId]);

  const loadMoreContent = async () => {
    if (!versionPublicId || !contentPagination.next_cursor || loadingMore) return;
    const requestedVersion = versionPublicId;
    setLoadingMore(true);
    setIndexError('');
    try {
      const page = await getResourceWorkbenchV2ModContents(publicId, requestedVersion, contentPagination.next_cursor);
      if (versionRef.current !== requestedVersion) return;
      setContents((current) => [...current, ...page.items]);
      setContentPagination(page.pagination);
    } catch (caught) {
      if (versionRef.current === requestedVersion) setIndexError(caught instanceof Error ? caught.message : labels.indexLoadFailed);
    } finally {
      if (versionRef.current === requestedVersion) setLoadingMore(false);
    }
  };

  return <FoldCard title={labels.modDetails} open>
    {!data ? <EmptyState>{labels.modEmpty}</EmptyState> : <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{labels.parser}: {parserVersion || labels.unknown}</span></div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs text-[var(--text-muted)]">{labels.modId}</dt><dd className="mt-1 break-all text-sm text-[var(--text)]">{modId || labels.unknown}</dd></div>
        <div><dt className="text-xs text-[var(--text-muted)]">{labels.version}</dt><dd className="mt-1 text-sm text-[var(--text)]">{version || labels.unknown}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-[var(--text-muted)]">{labels.gameVersions}</dt><dd className="mt-1 flex flex-wrap gap-1.5">{gameVersions.length ? gameVersions.map((item) => <span key={item} className="rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs">{item}</span>) : <span className="text-sm text-[var(--text-muted)]">{labels.unknown}</span>}</dd></div>
      </dl>
      <div><h4 className="text-xs font-semibold text-[var(--text-muted)]">{labels.dependencies}</h4>{dependencies.length ? <ul className="mt-2 space-y-1">{dependencies.map((item, index) => {
        const dependency = isRecord(item) ? item : null;
        const name = displayValue(dependency?.name) || displayValue(dependency?.mod_id) || displayValue(dependency?.id) || (typeof item === 'string' ? item : '');
        const constraint = displayValue(dependency?.version) || displayValue(dependency?.version_constraint);
        return <li key={`${name}:${index}`} className="break-all rounded bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]">{name || labels.unknown}{constraint && <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">{constraint}</span>}</li>;
      })}</ul> : <EmptyState>{labels.noDependencies}</EmptyState>}</div>
      {analysisData && <div className="space-y-3 border-t border-[var(--border)] pt-4">
        <h4 className="text-sm font-semibold text-[var(--text)]">{labels.modAnalysisDetails}</h4>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{labels.indexedContentCount}</dt><dd className="mt-1 text-sm text-[var(--text)]">{displayValue(analysisData.indexed_content_count) || '0'}</dd></div>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{labels.localizationCount}</dt><dd className="mt-1 text-sm text-[var(--text)]">{displayValue(analysisData.localization_count) || '0'}</dd></div>
        </dl>
        {manifest && <SummaryRows value={manifest} />}
      </div>}
      <div className="space-y-4 border-t border-[var(--border)] pt-4">
        <h4 className="text-sm font-semibold text-[var(--text)]">{labels.modContentIndex}</h4>
        {indexLoading ? <div role="status" className="text-sm text-[var(--text-muted)]">{labels.indexLoading}</div>
          : indexError ? <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{labels.indexLoadFailed}: {indexError}</div>
            : <>
              <div><h5 className="text-xs font-semibold text-[var(--text-muted)]">{labels.indexedContentCount}</h5>{contents.length ? <ul className="mt-2 space-y-2">{contents.map((item) => <li key={item.public_id} className="rounded-lg bg-[var(--bg-elevated)] p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--bg-card)] px-2 py-1 text-[11px]">{item.content_type}</span><span className="break-all text-sm font-medium text-[var(--text)]">{item.display_name || item.internal_name}</span>{item.display_name && item.display_name !== item.internal_name && <code className="break-all text-xs text-[var(--text-muted)]">{item.internal_name}</code>}</div>{item.description && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">{item.description}</p>}</li>)}</ul> : <EmptyState>{labels.noIndexedContent}</EmptyState>}{contentPagination.has_more && <button type="button" disabled={loadingMore} onClick={() => void loadMoreContent()} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--primary)] disabled:opacity-60">{loadingMore ? labels.loadingMore : labels.loadMoreContent}</button>}</div>
              <div><h5 className="text-xs font-semibold text-[var(--text-muted)]">{labels.localizationCoverage}</h5>{localizations.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{localizations.map((item) => <li key={item.locale} className="rounded-lg bg-[var(--bg-elevated)] p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm text-[var(--text)]">{item.locale}</span><span className="text-sm font-semibold tabular-nums text-[var(--text)]">{item.percentage}%</span></div><p className="mt-1 text-xs text-[var(--text-muted)]">{item.translated_count} / {item.total_count} {labels.translatedKeys}</p>{item.missing_keys.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-[var(--primary)]">{labels.missingKeys} ({item.missing_keys.length})</summary><ul className="mt-2 space-y-1">{item.missing_keys.slice(0, 12).map((key) => <li key={key} className="break-all font-mono text-[11px] text-[var(--text-muted)]">{key}</li>)}</ul></details>}</li>)}</ul> : <EmptyState>{labels.noLocalizationCoverage}</EmptyState>}</div>
            </>}
      </div>
    </div>}
  </FoldCard>;
}

function ResourceFacts({ workbench, analysis, versionPublicId, labels }: { workbench: ResourceWorkbenchV2Response; analysis: ResourceWorkbenchV2Analysis | null; versionPublicId: string | null; labels: Record<string, string> }) {
  const { resource } = workbench;
  const metadata = (resource.renderer?.public_metadata ?? resource.metadata) as V1ResourceMetadata;
  const map = metadata?.map;
  const schematic = metadata?.schematic;
  const mod = metadata?.mod;
  if (resource.resource_kind === 'mod') {
    return <ModDetails data={mod as Record<string, unknown> | undefined} analysis={analysis} publicId={resource.public_id} versionPublicId={versionPublicId} parserVersion={resource.renderer?.parser_version || null} labels={labels} />;
  }
  const data = resource.resource_kind === 'map' ? map : resource.resource_kind === 'schematic' ? schematic : undefined;
  if (!data) return <FoldCard title={labels.parserDetails}><EmptyState>{labels.detailsEmpty}</EmptyState></FoldCard>;
  const entries = Object.entries(data as Record<string, unknown>).filter(([, value]) => displayDetailsValue(value) !== '' && !Array.isArray(value));
  const arrays = Object.entries(data as Record<string, unknown>).filter(([, value]) => Array.isArray(value));
  return <FoldCard title={labels.parserDetails} open>
    <div className="space-y-4">
      {resource.renderer?.parser_version && <p className="text-xs text-[var(--text-muted)]">{labels.parser}: {resource.renderer.parser_version}</p>}
      <dl className="grid gap-3 sm:grid-cols-2">{entries.map(([key, value]) => <div key={key}><dt className="text-xs text-[var(--text-muted)]">{key.replaceAll('_', ' ')}</dt><dd className="mt-1 break-words text-sm text-[var(--text)]">{displayDetailsValue(value)}</dd></div>)}</dl>
      {arrays.map(([key, value]) => <div key={key}><h4 className="text-xs font-semibold text-[var(--text-muted)]">{key}</h4><div className="mt-2 flex flex-wrap gap-1.5">{(value as unknown[]).map((item, index) => {
        const label = displayDetailsValue(item);
        return label ? <span key={`${label}:${index}`} className="rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs">{label}</span> : null;
      })}</div></div>)}
    </div>
  </FoldCard>;
}

type DiffCounts = { added: number; removed: number; changed: number };

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function summarizeVersionDiff(kind: 'mod' | 'schematic' | 'map', diff: Record<string, unknown>): DiffCounts {
  const counts: DiffCounts = { added: 0, removed: 0, changed: 0 };
  if (kind === 'mod') {
    const summary = recordValue(diff.summary);
    if (summary) {
      counts.added = finiteCount(summary.added_content) + finiteCount(summary.added_files) + finiteCount(summary.added_dependencies);
      counts.removed = finiteCount(summary.removed_content) + finiteCount(summary.removed_files) + finiteCount(summary.removed_dependencies);
      counts.changed = finiteCount(summary.changed_content) + finiteCount(summary.renamed_content) + finiteCount(summary.changed_files)
        + finiteCount(summary.changed_dependencies) + finiteCount(summary.changed_manifest_fields);
    }
    return counts;
  }

  const groups = kind === 'map' ? ['resources', 'cores', 'spawns', 'waves', 'dependencies'] : ['blocks', 'materials', 'dependencies'];
  for (const key of groups) {
    const group = recordValue(diff[key]);
    if (!group) continue;
    counts.added += Array.isArray(group.added) ? group.added.length : 0;
    counts.removed += Array.isArray(group.removed) ? group.removed.length : 0;
    counts.changed += Array.isArray(group.changed) ? group.changed.length : 0;
  }
  counts.changed += Array.isArray(diff.metadata) ? diff.metadata.length : 0;
  if (kind === 'map' && diff.analysis) counts.changed += 1;
  if (kind === 'schematic') {
    if (diff.production) counts.changed += 1;
    if (typeof diff.power_net_delta === 'number' && diff.power_net_delta !== 0) counts.changed += 1;
    const logic = recordValue(diff.logic_processor_count);
    if (logic && logic.before !== logic.after) counts.changed += 1;
  }
  return counts;
}

function VersionDiffPanel({
  publicId,
  kind,
  version,
  versions,
  labels,
}: {
  publicId: string;
  kind: 'mod' | 'schematic' | 'map';
  version: ResourceWorkbenchV2Version | null;
  versions: ResourceWorkbenchV2Version[];
  labels: Record<string, string>;
}) {
  const [result, setResult] = useState<ResourceV2VersionDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const versionPublicId = version?.public_id;

  useEffect(() => {
    if (!versionPublicId) { setResult(null); setLoading(false); return; }
    let active = true;
    setLoading(true); setError(''); setResult(null);
    void getResourceV2VersionDiff(publicId, kind, versionPublicId)
      .then((next) => { if (active) setResult(next); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : labels.diffLoadFailed); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, kind, labels.diffLoadFailed, publicId, versionPublicId]);

  if (!version) return <EmptyState>{labels.noVersions}</EmptyState>;
  if (loading) return <p role="status" className="text-sm text-[var(--text-muted)]">{labels.diffLoading}</p>;
  if (error) return <div role="alert" className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"><p>{labels.diffLoadFailed}: {error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 rounded-lg border border-current px-3">{labels.retry}</button></div>;
  if (!result?.diff || result.status === 'unavailable') return <EmptyState>{labels.diffEmpty}</EmptyState>;

  const counts = summarizeVersionDiff(kind, result.diff);
  const fromVersion = versions.find((item) => item.public_id === result.from_version_public_id);
  const toVersion = versions.find((item) => item.public_id === result.to_version_public_id) || version;
  return <div className="space-y-4">
    <p className="text-sm text-[var(--text-muted)]">{labels.diffRange}: {fromVersion?.display_version || fromVersion?.version || labels.previousVersion} → {toVersion.display_version || toVersion.version}</p>
    {result.parser_version && <p className="text-xs text-[var(--text-muted)]">{labels.parser}: {result.parser_version}</p>}
    <dl aria-label={labels.diffSummary} className="grid grid-cols-3 gap-2 sm:gap-3">
      {(['added', 'removed', 'changed'] as const).map((key) => <div key={key} className="rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{labels[key]}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)]">{counts[key]}</dd></div>)}
    </dl>
    {counts.added + counts.removed + counts.changed === 0 && <EmptyState>{labels.diffNoChanges}</EmptyState>}
  </div>;
}

function VersionWorkspace({ version, locale, kind, publicId, versions, labels }: { version: ResourceWorkbenchV2Version | null; locale: string; kind: string; publicId: string; versions: ResourceWorkbenchV2Version[]; labels: Record<string, string> }) {
  const [tab, setTab] = useState<VersionTab>('summary');
  useEffect(() => setTab('summary'), [version?.public_id]);
  if (!version) return <EmptyState>{labels.noVersions}</EmptyState>;
  const supportsDiff = kind === 'mod' || kind === 'map' || kind === 'schematic';
  const tabs: Array<{ key: VersionTab; label: string }> = [
    { key: 'summary', label: labels.versionSummary },
    { key: 'files', label: labels.files },
    { key: 'compatibility', label: labels.compatibility },
    ...(supportsDiff ? [{ key: 'diff' as const, label: labels.diff }] : []),
  ];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-semibold text-[var(--text)]">{version.display_version || version.version}</h3><p className="mt-1 text-sm text-[var(--text-muted)]">{version.version_mode} · {version.release_channel} · {version.status}</p></div>
      {version.recommended && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--primary)]"><Check className="h-3.5 w-3.5" />{labels.recommended}</span>}
    </div>
    <div className="flex flex-wrap gap-2 border-b border-[var(--border)]" role="tablist" aria-label={labels.versionTabs}>
      {tabs.map(({ key, label }) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-10 border-b-2 px-3 text-sm ${tab === key ? 'border-[var(--primary)] font-semibold text-[var(--primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'}`}>{label}</button>)}
    </div>
    {tab === 'summary' && <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{labels.revision}</p><p className="mt-1 text-sm text-[var(--text)]">{version.revision ?? labels.unknown}</p></div>
      <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{labels.publishedAt}</p><p className="mt-1 text-sm text-[var(--text)]">{formatDate(version.published_at, locale, labels.unknown)}</p></div>
      <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{labels.gameRange}</p><p className="mt-1 break-words text-sm text-[var(--text)]">{version.game_version_min || labels.unknown} – {version.game_version_max || labels.unknown}</p></div>
      <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{labels.files}</p><p className="mt-1 text-sm text-[var(--text)]">{version.files.length}</p></div>
    </div>}
    {tab === 'files' && (version.files.length ? <ul className="space-y-2">{version.files.map((file) => <FileRow key={file.public_id} file={file} labels={labels} />)}</ul> : <EmptyState>{labels.noFiles}</EmptyState>)}
    {tab === 'compatibility' && <CompatibilityPanel version={version} labels={labels} />}
    {tab === 'diff' && supportsDiff && <VersionDiffPanel publicId={publicId} kind={kind as 'mod' | 'map' | 'schematic'} version={version} versions={versions} labels={labels} />}
  </div>;
}

function CompatibilityPanel({ version, labels }: { version: ResourceWorkbenchV2Version; labels: Record<string, string> }) {
  return <div className="space-y-4">
    {version.compatibility.length ? <ul className="grid gap-2 sm:grid-cols-2">{version.compatibility.map((item, index) => <li key={`${item.runtime}:${item.game_version}:${index}`} className="rounded-lg border border-[var(--border)] p-3">
      <p className="font-medium text-[var(--text)]">{item.runtime}{item.game_version ? ` · ${item.game_version}` : ''}{item.status ? ` · ${item.status}` : ''}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{item.min_game_version || labels.unknown} – {item.max_game_version || labels.unknown}{item.channel ? ` · ${item.channel}` : ''}{item.platform ? ` · ${item.platform}` : ''}</p>
      {item.source && <p className="mt-1 text-xs text-[var(--text-muted)]">{labels.source}: {item.source}{item.confidence ? ` · ${item.confidence}` : ''}</p>}
      {item.notes && <p className="mt-1 text-xs text-[var(--text-muted)]">{item.notes}</p>}
    </li>)}</ul> : <EmptyState>{labels.noCompatibility}</EmptyState>}
    <div><h4 className="mb-2 text-sm font-semibold text-[var(--text)]">{labels.dependencies}</h4>{version.dependencies.length ? <ul className="space-y-2">{version.dependencies.map((item, index) => <li key={`${item.dependency_type}:${item.resource_public_id || item.external_identifier}:${index}`} className="rounded-lg border border-[var(--border)] p-3 text-sm">
      <span className="font-medium text-[var(--text)]">{item.resource_public_id ? <Link className="text-[var(--primary)] hover:underline" href={`/resources/${encodeURIComponent(item.resource_public_id)}/workbench`}>{item.resource_public_id}</Link> : item.external_identifier || item.upstream_url || labels.unknown}</span>
      <span className="ml-2 text-[var(--text-muted)]">{item.dependency_type}{item.version_constraint ? ` · ${item.version_constraint}` : ''}{item.resolution_status ? ` · ${item.resolution_status}` : ''}</span>
    </li>)}</ul> : <EmptyState>{labels.noDependencies}</EmptyState>}</div>
  </div>;
}

export default function ResourceWorkbenchV2({ publicId }: { publicId: string }) {
  const { t, locale } = useI18n();
  const [workbench, setWorkbench] = useState<ResourceWorkbenchV2Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<ResourceWorkbenchV2Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const refreshWorkbench = useCallback(async (preferredVersionId?: string, signal?: AbortSignal) => {
    const result = await getResourceWorkbenchV2(publicId, { signal });
    setWorkbench(result);
    setSelectedVersionId((current) => preferredVersionId && result.versions.some((version) => version.public_id === preferredVersionId)
      ? preferredVersionId
      : result.versions.some((version) => version.public_id === current)
        ? current
        : result.versions.find((version) => version.recommended)?.public_id || result.versions[0]?.public_id || '');
    setError(null);
    return result;
  }, [publicId]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      await refreshWorkbench(undefined, signal);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof V1ApiError ? caught.message : t('resourceWorkbenchV2.loadFailed'));
      setWorkbench(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [refreshWorkbench, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selectedVersion = useMemo(() => workbench?.versions.find((version) => version.public_id === selectedVersionId) || workbench?.versions.find((version) => version.recommended) || workbench?.versions[0] || null, [selectedVersionId, workbench]);
  useEffect(() => {
    if (!workbench) {
      setSelectedAnalysis(null);
      setAnalysisLoading(false);
      setAnalysisError('');
      return;
    }
    if (!selectedVersion) {
      setSelectedAnalysis(workbench.analysis);
      setAnalysisLoading(false);
      setAnalysisError('');
      return;
    }
    const defaultVersion = workbench.versions.find((version) => version.recommended) || workbench.versions[0];
    if (selectedVersion.public_id === defaultVersion?.public_id) {
      setSelectedAnalysis(workbench.analysis);
      setAnalysisLoading(false);
      setAnalysisError('');
      return;
    }

    if (!['mod', 'map', 'schematic'].includes(workbench.resource.resource_kind)) {
      setSelectedAnalysis(null);
      setAnalysisLoading(false);
      setAnalysisError('');
      return;
    }

    const controller = new AbortController();
    setSelectedAnalysis(null);
    setAnalysisLoading(true);
    setAnalysisError('');
    void getResourceWorkbenchV2Analysis(publicId, workbench.resource.resource_kind as 'mod' | 'map' | 'schematic', selectedVersion.public_id, { signal: controller.signal })
      .then((result) => setSelectedAnalysis(result))
      .catch((caught) => {
        if (!controller.signal.aborted) setAnalysisError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.analysisLoadFailed'));
      })
      .finally(() => { if (!controller.signal.aborted) setAnalysisLoading(false); });
    return () => controller.abort();
  }, [publicId, selectedVersion, t, workbench]);
  const canPublish = Boolean(workbench?.permissions.can_manage)
    && ['owner', 'maintainer', 'publisher'].includes(workbench?.permissions.role || '');
  const canEditProfile = Boolean(workbench?.permissions.can_manage)
    && ['owner', 'maintainer'].includes(workbench?.permissions.role || '');
  const sectionItems: Array<{ key: SectionKey; label: string }> = [
    { key: 'overview', label: t('resourceWorkbenchV2.overview') },
    { key: 'publish', label: t('resourceWorkbenchV2.publish') },
    { key: 'compatibility', label: t('resourceWorkbenchV2.compatibility') },
    { key: 'analysis', label: t('resourceWorkbenchV2.analysis') },
    { key: 'community', label: t('resourceWorkbenchV2.community.interactions') },
    { key: 'settings', label: t('resourceWorkbenchV2.settings') },
  ];

  const sharedLabels: Record<string, string> = {
    unknown: t('resourceWorkbenchV2.unknown'), download: t('resourceWorkbenchV2.download'),
    unavailable: t('resourceWorkbenchV2.unavailable'), parser: t('resourceWorkbenchV2.parser'),
    dependencies: t('resourceWorkbenchV2.dependencies'), noDependencies: t('resourceWorkbenchV2.noDependencies'),
    compatibility: t('resourceWorkbenchV2.compatibility'), source: t('resourceWorkbenchV2.source'),
    noCompatibility: t('resourceWorkbenchV2.noCompatibility'), versionSummary: t('resourceWorkbenchV2.versionSummary'),
    files: t('resourceWorkbenchV2.files'), versionTabs: t('resourceWorkbenchV2.versionTabs'),
    recommended: t('resourceWorkbenchV2.recommended'), revision: t('resourceWorkbenchV2.revision'),
    publishedAt: t('resourceWorkbenchV2.publishedAt'), gameRange: t('resourceWorkbenchV2.gameRange'),
    noFiles: t('resourceWorkbenchV2.noFiles'),
    diff: t('resourceWorkbenchV2.diff'), diffLoading: t('resourceWorkbenchV2.diffLoading'),
    diffLoadFailed: t('resourceWorkbenchV2.diffLoadFailed'), diffEmpty: t('resourceWorkbenchV2.diffEmpty'),
    diffNoChanges: t('resourceWorkbenchV2.diffNoChanges'), diffRange: t('resourceWorkbenchV2.diffRange'),
    diffSummary: t('resourceWorkbenchV2.diffSummary'), previousVersion: t('resourceWorkbenchV2.previousVersion'),
    added: t('resourceWorkbenchV2.added'), removed: t('resourceWorkbenchV2.removed'), changed: t('resourceWorkbenchV2.changed'),
    retry: t('resourceWorkbenchV2.retry'),
  };

  const navigateTo = (key: SectionKey) => {
    setActiveSection(key);
    setMobileNavOpen(false);
  };

  const resource = workbench?.resource;
  const metadata = resource?.renderer?.public_metadata ?? resource?.metadata;
  const mapMetadata = resource?.metadata.map;
  const schematicMetadata = resource?.metadata.schematic;
  const analyzedWaveData = workbench?.analysis?.data?.waves;
  const waveData = Array.isArray(analyzedWaveData) && analyzedWaveData.length > 0 ? analyzedWaveData : mapMetadata?.wave_groups;
  const dimensions = resource?.resource_kind === 'map' ? mapMetadata : resource?.resource_kind === 'schematic' ? schematicMetadata : undefined;
  const previewWidth = dimensions?.width ?? null;
  const previewHeight = dimensions?.height ?? null;
  const resourceIcon = resource?.resource_kind === 'mod' ? Puzzle : resource?.resource_kind === 'map' ? Map : resource?.resource_kind === 'schematic' ? Boxes : Package;
  const ResourceIcon = resourceIcon;
  const rendererStatus = resource?.renderer?.status || resource?.metadata.preview.status || 'none';

  return <div className="content-width-detail mx-auto min-w-0 px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link href="/resources" className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]">← {t('resourceWorkbenchV2.backToResources')}</Link>
      <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.v2Badge')}</span>
    </div>

    {loading && <div role="status" className="flex min-h-72 items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)]"><RefreshCw className="h-5 w-5 animate-spin" />{t('resourceWorkbenchV2.loading')}</div>}
    {!loading && error && <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center"><AlertCircle className="mx-auto h-8 w-8 text-red-500" /><h1 className="mt-3 text-xl font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.loadFailed')}</h1><p className="mt-2 break-words text-sm text-[var(--text-muted)]">{error}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />{t('resourceWorkbenchV2.retry')}</button></div>}

    {!loading && !error && workbench && resource && <>
      <header className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><ResourceIcon className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{resource.resource_kind}</p><h1 className="mt-1 break-words text-2xl font-bold text-[var(--text)] sm:text-3xl">{resource.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{resource.summary || resource.description || t('resourceWorkbenchV2.noDescription')}</p></div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${workbench.permissions.can_manage ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}><Shield className="h-3.5 w-3.5" />{workbench.permissions.can_manage ? t('resourceWorkbenchV2.manager') : t('resourceWorkbenchV2.readOnly')}</span></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[[t('resourceWorkbenchV2.views'), workbench.stats.views], [t('resourceWorkbenchV2.downloads'), workbench.stats.downloads], [t('resourceWorkbenchV2.likes'), workbench.stats.likes], [t('resourceWorkbenchV2.favorites'), workbench.stats.favorites]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">{Number(value).toLocaleString(locale)}</p></div>)}
        </div>
      </header>

      <div className="mb-4 lg:hidden">
        <button type="button" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-semibold text-[var(--text)]"><span>{t('resourceWorkbenchV2.sections')}: {sectionItems.find((item) => item.key === activeSection)?.label}</span><ChevronDown className={`h-4 w-4 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} /></button>
        {mobileNavOpen && <nav aria-label={t('resourceWorkbenchV2.sections')} className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2">{sectionItems.map(({ key, label }) => {
          const Icon = SECTION_ICONS[key];
          return <button key={key} type="button" aria-current={activeSection === key ? 'page' : undefined} onClick={() => navigateTo(key)} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm ${activeSection === key ? 'bg-[var(--primary-soft)] font-semibold text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>;
        })}</nav>}
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden lg:block"><nav aria-label={t('resourceWorkbenchV2.sections')} className="sticky top-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2">{sectionItems.map(({ key, label }) => {
          const Icon = SECTION_ICONS[key];
          return <button key={key} type="button" aria-current={activeSection === key ? 'page' : undefined} onClick={() => navigateTo(key)} className={`mb-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm last:mb-0 ${activeSection === key ? 'bg-[var(--primary-soft)] font-semibold text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>;
        })}</nav></aside>

        <main className="min-w-0 space-y-4">
          {activeSection === 'overview' && <>
            {(resource.resource_kind === 'map' || resource.resource_kind === 'schematic') && <ResourcePreviewViewer
              title={t('resourceWorkbenchV2.preview')}
              kind={resource.resource_kind}
              imageUrl={resource.renderer?.preview_url || resource.metadata.preview.url}
              status={rendererStatus}
              metadata={metadata}
              width={previewWidth}
              height={previewHeight}
              waveData={waveData}
              labels={{
                zoomIn: t('resourceWorkbenchV2.zoomIn'), zoomOut: t('resourceWorkbenchV2.zoomOut'), reset: t('resourceWorkbenchV2.reset'),
                coordinates: t('resourceWorkbenchV2.coordinates'), approximate: t('resourceWorkbenchV2.approximate'), grid: t('resourceWorkbenchV2.grid'),
                markers: t('resourceWorkbenchV2.markers'), noMarkers: t('resourceWorkbenchV2.noMarkers'), noPreview: t('resourceWorkbenchV2.noPreview'),
                inspect: t('resourceWorkbenchV2.inspectBlock'), selected: t('resourceWorkbenchV2.selectedMarker'),
                layersTitle: t('resourceWorkbenchV2.previewLayers'),
                layersNote: t('resourceWorkbenchV2.schematicLayerNote'),
                layersTruncated: t('resourceWorkbenchV2.mapLayersTruncated'),
                layers: {
                  logistics: t('resourceWorkbenchV2.layerLogistics'), liquid: t('resourceWorkbenchV2.layerLiquid'),
                  power: t('resourceWorkbenchV2.layerPower'), input_output: t('resourceWorkbenchV2.layerInputOutput'),
                  terrain: t('resourceWorkbenchV2.layerTerrain'), resources: t('resourceWorkbenchV2.layerResources'),
                  ores: t('resourceWorkbenchV2.layerOres'), cores: t('resourceWorkbenchV2.layerCores'),
                  enemy_spawns: t('resourceWorkbenchV2.layerEnemySpawns'), buildings: t('resourceWorkbenchV2.layerBuildings'),
                  player_area: t('resourceWorkbenchV2.layerPlayerArea'),
                },
                wave: {
                  title: t('resourceWorkbenchV2.waveViewer'), chart: t('resourceWorkbenchV2.waveStrengthChart'),
                  range: t('resourceWorkbenchV2.waveRange'), enemies: t('resourceWorkbenchV2.waveEnemies'),
                  health: t('resourceWorkbenchV2.waveEstimatedHealth'), airRatio: t('resourceWorkbenchV2.waveAirRatio'),
                  bosses: t('resourceWorkbenchV2.waveBosses'), strength: t('resourceWorkbenchV2.waveStrength'),
                  spike: t('resourceWorkbenchV2.waveSpike'), estimated: t('resourceWorkbenchV2.estimated'),
                  openEnded: t('resourceWorkbenchV2.waveOpenEnded'),
                  empty: t('resourceWorkbenchV2.waveEmpty'), unknown: t('resourceWorkbenchV2.unknown'),
                },
                status: { processing: t('resourceWorkbenchV2.rendererProcessing'), ready: t('resourceWorkbenchV2.rendererReady'), failed: t('resourceWorkbenchV2.rendererFailed'), unavailable: t('resourceWorkbenchV2.rendererUnavailable'), none: t('resourceWorkbenchV2.rendererNone') },
              }}
            />}
            <ResourceFacts workbench={workbench} versionPublicId={selectedVersion?.public_id || null} labels={{
              modDetails: t('resourceWorkbenchV2.modDetails'), modEmpty: t('resourceWorkbenchV2.modEmpty'), parser: t('resourceWorkbenchV2.parser'), unknown: t('resourceWorkbenchV2.unknown'),
              modId: t('resourceWorkbenchV2.modId'), version: t('resourceWorkbenchV2.version'), gameVersions: t('resourceWorkbenchV2.gameVersions'), dependencies: t('resourceWorkbenchV2.dependencies'), noDependencies: t('resourceWorkbenchV2.noDependencies'),
              modAnalysisDetails: t('resourceWorkbenchV2.modAnalysisDetails'), indexedContentCount: t('resourceWorkbenchV2.indexedContentCount'), localizationCount: t('resourceWorkbenchV2.localizationCount'),
              modContentIndex: t('resourceWorkbenchV2.modContentIndex'), indexLoading: t('resourceWorkbenchV2.indexLoading'), indexLoadFailed: t('resourceWorkbenchV2.indexLoadFailed'), noIndexedContent: t('resourceWorkbenchV2.noIndexedContent'), loadMoreContent: t('resourceWorkbenchV2.loadMoreContent'), loadingMore: t('resourceWorkbenchV2.loadingMore'), localizationCoverage: t('resourceWorkbenchV2.localizationCoverage'), noLocalizationCoverage: t('resourceWorkbenchV2.noLocalizationCoverage'), translatedKeys: t('resourceWorkbenchV2.translatedKeys'), missingKeys: t('resourceWorkbenchV2.missingKeys'),
              parserDetails: t('resourceWorkbenchV2.parserDetails'), detailsEmpty: t('resourceWorkbenchV2.detailsEmpty'),
            }} analysis={selectedAnalysis} />
            <FoldCard title={t('resourceWorkbenchV2.about')} open><div className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">{resource.description ? <p className="whitespace-pre-wrap">{resource.description}</p> : resource.content_text ? <p className="whitespace-pre-wrap">{resource.content_text}</p> : <EmptyState>{t('resourceWorkbenchV2.noDescription')}</EmptyState>}<div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{t('resourceWorkbenchV2.visibility')}: {resource.visibility}</span><span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1">{t('resourceWorkbenchV2.renderer')}: {rendererStatus}</span></div></div></FoldCard>
            <FoldCard title={t('resourceWorkbenchV2.versionWorkspace')} open>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><label htmlFor="workbench-version" className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.selectVersion')}</label><select id="workbench-version" value={selectedVersion?.public_id || ''} onChange={(event) => setSelectedVersionId(event.target.value)} disabled={workbench.versions.length === 0} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] sm:max-w-sm">{workbench.versions.length === 0 && <option value="">{t('resourceWorkbenchV2.noVersions')}</option>}{workbench.versions.map((version) => <option key={version.public_id} value={version.public_id}>{version.display_version || version.version}{version.recommended ? ` · ${t('resourceWorkbenchV2.recommended')}` : ''}</option>)}</select></div>
              <VersionWorkspace version={selectedVersion} locale={locale} kind={resource.resource_kind} publicId={resource.public_id} versions={workbench.versions} labels={{ ...sharedLabels, noVersions: t('resourceWorkbenchV2.noVersions') }} />
            </FoldCard>
            {resource.resource_kind === 'schematic' && <FoldCard title={t('resourceWorkbenchV2.schematicEditor.title')}>
              <SchematicLightEditor workbench={workbench} version={selectedVersion} canEdit={canEditProfile} />
            </FoldCard>}
          </>}

          {activeSection === 'publish' && <div className="space-y-4">
            <FoldCard title={t('resourceWorkbenchV2.publishWorkflow')} open>
              {['mod', 'map', 'schematic'].includes(resource.resource_kind)
                ? canPublish
                  ? <ResourceReleaseForm workbench={workbench} onReleased={(result) => { void refreshWorkbench(result.version.public_id).catch((caught) => setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.loadFailed'))); }} />
                  : workbench.permissions.can_manage
                    ? <EmptyState>{t('resourceWorkbenchV2.writeRoleUnsupported')}</EmptyState>
                    : <EmptyState>{t('resourceWorkbenchV2.writeDisabledViewer')}</EmptyState>
                : <EmptyState>{t('resourceWorkbenchV2.releaseKindUnavailable')}</EmptyState>}
            </FoldCard>
            <FoldCard title={t('resourceWorkbenchV2.existingVersions')}><VersionWorkspace version={selectedVersion} locale={locale} kind={resource.resource_kind} publicId={resource.public_id} versions={workbench.versions} labels={{ ...sharedLabels, noVersions: t('resourceWorkbenchV2.noVersions') }} /></FoldCard>
          </div>}

          {activeSection === 'compatibility' && <FoldCard title={t('resourceWorkbenchV2.compatibility')} open><div className="space-y-5"><div className="flex flex-wrap items-center gap-2"><label htmlFor="compat-version" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.selectVersion')}</label><select id="compat-version" value={selectedVersion?.public_id || ''} onChange={(event) => setSelectedVersionId(event.target.value)} disabled={workbench.versions.length === 0} className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm">{workbench.versions.map((version) => <option key={version.public_id} value={version.public_id}>{version.display_version || version.version}</option>)}</select></div>{selectedVersion ? <CompatibilityPanel version={selectedVersion} labels={sharedLabels} /> : <EmptyState>{t('resourceWorkbenchV2.noVersions')}</EmptyState>}</div></FoldCard>}

          {activeSection === 'analysis' && <FoldCard title={t('resourceWorkbenchV2.analysis')} open><AnalysisPanel analysis={selectedAnalysis} loading={analysisLoading} error={analysisError} labels={{ analysisEmpty: t('resourceWorkbenchV2.analysisEmpty'), analysisLoading: t('resourceWorkbenchV2.analysisLoading'), analysisLoadFailed: t('resourceWorkbenchV2.analysisLoadFailed'), parser: t('resourceWorkbenchV2.parser'), ignored: t('resourceWorkbenchV2.ignored'), noFindings: t('resourceWorkbenchV2.noFindings'), kindAnalysis: t('resourceWorkbenchV2.kindAnalysis'), modAnalysisDetails: t('resourceWorkbenchV2.modAnalysisDetails'), schematicAnalysis: t('resourceWorkbenchV2.schematicAnalysis'), mapAnalysis: t('resourceWorkbenchV2.mapAnalysis'), productionEstimate: t('resourceWorkbenchV2.productionEstimate'), estimated: t('resourceWorkbenchV2.estimated'), measured: t('resourceWorkbenchV2.measured'), available: t('resourceWorkbenchV2.available'), unavailable: t('resourceWorkbenchV2.unavailable'), bottlenecks: t('resourceWorkbenchV2.bottlenecks'), analysisWarnings: t('resourceWorkbenchV2.analysisWarnings'), difficulty: t('resourceWorkbenchV2.difficulty'), confidence: t('resourceWorkbenchV2.confidence'), resourceBalance: t('resourceWorkbenchV2.resourceBalance'), pathAnalysis: t('resourceWorkbenchV2.pathAnalysis'), waves: t('resourceWorkbenchV2.waves'), unknown: t('resourceWorkbenchV2.unknown') }} /></FoldCard>}

          {activeSection === 'community' && <>
            <FoldCard title={t('resourceWorkbenchV2.communityStats')} open><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[
              [t('resourceWorkbenchV2.views'), workbench.stats.views], [t('resourceWorkbenchV2.downloads'), workbench.stats.downloads], [t('resourceWorkbenchV2.likes'), workbench.stats.likes], [t('resourceWorkbenchV2.favorites'), workbench.stats.favorites], [t('resourceWorkbenchV2.ratings'), workbench.stats.rating_count], [t('resourceWorkbenchV2.averageRating'), workbench.stats.rating_average],
            ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)]">{Number(value).toLocaleString(locale)}</p></div>)}</div></FoldCard>
            <FoldCard title={t('resourceWorkbenchV2.relatedResources')} open>{workbench.relations.length ? <ul className="space-y-2">{workbench.relations.map((relation) => {
              const relationTypeKey = `resourceWorkbenchV2.community.relationTypes.${relation.relation_type}`;
              const relationTypeLabel = ['recommended_for', 'fork_of', 'successor_of', 'related'].includes(relation.relation_type)
                ? t(relationTypeKey)
                : relation.relation_type;
              const versionLabel = relation.version || relation.version_public_id;
              return <li key={`${relation.relation_type}:${relation.resource.public_id}:${relation.version_public_id || ''}`} className="flex flex-col gap-1 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/resources/${encodeURIComponent(relation.resource.public_id)}/workbench`} className="min-w-0 break-words font-medium text-[var(--primary)] hover:underline">{relation.resource.title}</Link>
                <span className="text-xs text-[var(--text-muted)]">{t(`resourceWorkbenchV2.community.relationDirections.${relation.relation_direction}`)} · {relationTypeLabel}{relation.relation_type === 'recommended_for' ? ` · ${t(`resourceWorkbenchV2.community.context.${relation.relation_context}`)}` : ''} · {relation.resource.resource_kind}{versionLabel ? ` · ${t('resourceWorkbenchV2.community.relatedVersion')}: ${versionLabel}` : ''}</span>
              </li>;
            })}</ul> : <EmptyState>{t('resourceWorkbenchV2.noRelations')}</EmptyState>}</FoldCard>
            <ResourceCommunityInteractions workbench={workbench} version={selectedVersion} onRelationsChanged={() => { void refreshWorkbench().catch((caught) => setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.loadFailed'))); }} />
          </>}

          {activeSection === 'settings' && <div className="space-y-4">
            <FoldCard title={t('resourceWorkbenchV2.resourceSettings')} open>
              <dl className="mb-5 grid gap-3 rounded-lg bg-[var(--bg-elevated)] p-4 sm:grid-cols-2"><div><dt className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.visibility')}</dt><dd className="mt-1 text-sm text-[var(--text)]">{resource.visibility}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.role')}</dt><dd className="mt-1 text-sm text-[var(--text)]">{workbench.permissions.role || t('resourceWorkbenchV2.viewer')}</dd></div></dl>
              <ResourceProfileEditor workbench={workbench} canEdit={canEditProfile} onSaved={() => { void refreshWorkbench().catch((caught) => setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.loadFailed'))); }} />
            </FoldCard>
          </div>}
        </main>
      </div>
    </>}
  </div>;
}
