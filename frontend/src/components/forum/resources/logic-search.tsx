'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { searchSchematicLogic, type SchematicLogicSnippet } from '@/lib/api/v1/resource-visual-diff';

/**
 * Public schematic logic search.
 *
 * Filters are bounded both in the inputs and again in the API client, so a
 * pasted URL, a huge query or trailing whitespace never reaches the endpoint.
 * Requests are aborted when the query changes or the component unmounts.
 */

const LIMITS = { q: 200, opcode: 50, unit: 50, processorType: 64 } as const;

type FilterKey = keyof typeof LIMITS;
type FormState = Record<FilterKey, string>;
type SearchRequest = FormState & { cursor: string | null };

const EMPTY_FORM: FormState = { q: '', opcode: '', unit: '', processorType: '' };

function bounded(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function severityClass(severity: string): string {
  if (severity === 'error') return 'bg-red-500/10 text-red-700 dark:text-red-300';
  if (severity === 'warning') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'bg-sky-500/10 text-sky-700 dark:text-sky-300';
}

function LogicSnippetCard({ item }: { item: SchematicLogicSnippet }) {
  const { t, locale } = useI18n();
  const missing = t('logicSearch.valueMissing');
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const href = `/resources/${encodeURIComponent(item.resource_public_id)}#logic`;
  const severityLabel = (severity: string) => {
    if (severity === 'error') return t('logicSearch.severityError');
    if (severity === 'warning') return t('logicSearch.severityWarning');
    if (severity === 'info') return t('logicSearch.severityInfo');
    return severity;
  };
  const position = item.position.x !== null || item.position.y !== null
    ? `(${item.position.x ?? '—'}, ${item.position.y ?? '—'})`
    : missing;
  const sourceLines = item.source_excerpt ? item.source_excerpt.split(/\r?\n/).slice(0, 12) : [];

  return <li className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words text-base font-semibold text-[var(--text)]">
          <Link href={href} className="hover:text-[var(--primary-text)] hover:underline">{item.title}</Link>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          {item.author?.avatar_url ? <img src={item.author.avatar_url} alt="" loading="lazy" className="h-5 w-5 rounded-full object-cover" /> : null}
          <span>{item.author?.username ?? t('logicSearch.authorUnknown')}</span>
          <span aria-hidden="true">·</span>
          <Link href={href} className="font-mono hover:text-[var(--primary-text)] hover:underline">{t('logicSearch.versionLabel')}: {item.version ?? item.version_public_id.slice(0, 8)}</Link>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{item.processor_type}</span>
        </p>
      </div>
      <Link href={href} className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary-text)]">{t('logicSearch.openResource')}</Link>
    </div>

    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
      <div className="rounded bg-[var(--bg-elevated)] p-2">
        <dt className="text-[var(--text-muted)]">{t('logicSearch.instructions')}</dt>
        <dd className="font-semibold text-[var(--text)]">{number(item.instruction_count)}</dd>
      </div>
      <div className="rounded bg-[var(--bg-elevated)] p-2">
        <dt className="text-[var(--text-muted)]">{t('logicSearch.cycles')}</dt>
        <dd className="font-semibold text-[var(--text)]">{item.estimated_cycle_ticks === null ? missing : number(item.estimated_cycle_ticks)}</dd>
      </div>
      <div className="rounded bg-[var(--bg-elevated)] p-2">
        <dt className="text-[var(--text-muted)]">{t('logicSearch.positionLabel')}</dt>
        <dd className="font-mono font-semibold text-[var(--text)]">{position}</dd>
      </div>
    </dl>

    <div className="mt-2 flex flex-wrap items-center gap-2">
      {item.has_warnings
        ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">{t('logicSearch.warnings')}</span>
        : <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">{t('logicSearch.noWarnings')}</span>}
      {item.opcodes.length ? <ul className="flex flex-wrap gap-1" aria-label={t('logicSearch.opcodes')}>
        {item.opcodes.slice(0, 20).map((opcode, index) => <li key={`${opcode}:${index}`} className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">{opcode}</li>)}
      </ul> : null}
    </div>

    {item.findings.length ? <section className="mt-3 space-y-1">
      <h4 className="text-xs font-semibold text-[var(--text)]">{t('logicSearch.findingsTitle')}</h4>
      <ul className="space-y-1">
        {item.findings.slice(0, 3).map((finding, index) => <li key={`${finding.code}:${finding.line ?? 'none'}:${index}`} className="flex flex-wrap items-baseline gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${severityClass(finding.severity)}`}>{severityLabel(finding.severity)}</span>
          <span className="break-words text-[var(--text-secondary)]">{finding.message}</span>
          {finding.line !== null ? <span className="font-mono text-[var(--text-muted)]">{t('logicSearch.findingLine', { line: finding.line })}</span> : null}
        </li>)}
      </ul>
      {item.findings.length > 3 ? <p className="text-xs text-[var(--text-muted)]">{t('logicSearch.findingsMore', { count: item.findings.length - 3 })}</p> : null}
    </section> : null}

    <section className="mt-3 space-y-1">
      <h4 className="text-xs font-semibold text-[var(--text)]">{t('logicSearch.sourceTitle')}</h4>
      {sourceLines.length
        ? <pre className="max-h-56 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs leading-5 text-[var(--text-secondary)]">{sourceLines.join('\n')}</pre>
        : <p className="text-xs text-[var(--text-muted)]">{t('logicSearch.sourceEmpty')}</p>}
    </section>
  </li>;
}

export default function LogicSearch() {
  const { t, locale } = useI18n();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [request, setRequest] = useState<SearchRequest>({ ...EMPTY_FORM, cursor: null });
  const [items, setItems] = useState<SchematicLogicSnippet[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    if (request.cursor === null) {
      setLoading(true);
      setLoadingMore(false);
      setItems([]);
    } else {
      setLoadingMore(true);
      setLoading(false);
    }
    searchSchematicLogic({
      q: request.q || undefined,
      opcode: request.opcode || undefined,
      unit: request.unit || undefined,
      processorType: request.processorType || undefined,
      cursor: request.cursor ?? undefined,
      limit: 20,
      signal: controller.signal,
    }).then((response) => {
      if (controller.signal.aborted) return;
      setItems((current) => request.cursor === null ? response.items : [...current, ...response.items]);
      setNextCursor(response.pagination.next_cursor);
      setHasMore(response.pagination.has_more);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (controller.signal.aborted) return;
      setLoading(false);
      setLoadingMore(false);
    });
    return () => controller.abort();
  }, [request]);

  const update = (key: FilterKey, value: string) => setForm((current) => ({ ...current, [key]: value.slice(0, LIMITS[key]) }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setItems([]);
    setRequest({
      q: bounded(form.q, LIMITS.q),
      opcode: bounded(form.opcode, LIMITS.opcode),
      unit: bounded(form.unit, LIMITS.unit),
      processorType: bounded(form.processorType, LIMITS.processorType),
      cursor: null,
    });
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setItems([]);
    setRequest({ ...EMPTY_FORM, cursor: null });
  };

  const loadMore = () => {
    if (!hasMore || !nextCursor || loading || loadingMore) return;
    setRequest((current) => ({ ...current, cursor: nextCursor }));
  };

  const retry = () => {
    setItems([]);
    setRequest((current) => ({ ...current, cursor: null }));
  };

  return <div className="min-w-0 space-y-4">
    <p className="text-sm text-[var(--text-muted)]">{t('logicSearch.description')}</p>

    <form onSubmit={submit} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          <span>{t('logicSearch.queryLabel')}</span>
          <input
            type="search"
            value={form.q}
            maxLength={LIMITS.q}
            onChange={(event) => update('q', event.target.value)}
            placeholder={t('logicSearch.queryPlaceholder')}
            className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm text-[var(--text-secondary)]">
          <span>{t('logicSearch.opcodeLabel')}</span>
          <input
            type="text"
            value={form.opcode}
            maxLength={LIMITS.opcode}
            onChange={(event) => update('opcode', event.target.value)}
            placeholder={t('logicSearch.opcodePlaceholder')}
            className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 font-mono text-sm text-[var(--text)]"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm text-[var(--text-secondary)]">
          <span>{t('logicSearch.unitLabel')}</span>
          <input
            type="text"
            value={form.unit}
            maxLength={LIMITS.unit}
            onChange={(event) => update('unit', event.target.value)}
            placeholder={t('logicSearch.unitPlaceholder')}
            className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 font-mono text-sm text-[var(--text)]"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          <span>{t('logicSearch.processorTypeLabel')}</span>
          <input
            type="text"
            value={form.processorType}
            maxLength={LIMITS.processorType}
            onChange={(event) => update('processorType', event.target.value)}
            placeholder={t('logicSearch.processorTypePlaceholder')}
            className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 font-mono text-sm text-[var(--text)]"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--primary-button)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]">
          <Search className="h-4 w-4" aria-hidden="true" />
          {t('logicSearch.submit')}
        </button>
        <button type="button" onClick={reset} className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary-text)]">
          {t('logicSearch.reset')}
        </button>
      </div>
    </form>

    <div aria-live="polite" className="space-y-3">
      {loading ? <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('logicSearch.loading')}</p> : null}
      {error ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <span>{t('logicSearch.error')}</span>
        <button type="button" onClick={retry} className="min-h-11 rounded-md border border-current px-3">{t('logicSearch.retry')}</button>
      </div> : null}
      {!loading && !error && items.length === 0 ? <div className="rounded-md border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">{t('logicSearch.empty')}</div> : null}
      {items.length ? <>
        <p className="text-sm text-[var(--text-secondary)]">{t('logicSearch.resultsCount', { count: new Intl.NumberFormat(locale).format(items.length) })}</p>
        <ul className="space-y-3">{items.map((item) => <LogicSnippetCard key={item.id} item={item} />)}</ul>
        <div className="flex justify-center">
          {hasMore
            ? <button type="button" onClick={loadMore} disabled={loadingMore} className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary-text)] disabled:opacity-60">
              {loadingMore ? t('logicSearch.loadingMore') : t('logicSearch.loadMore')}
            </button>
            : <p className="text-xs text-[var(--text-muted)]">{t('logicSearch.endOfResults')}</p>}
        </div>
      </> : null}
    </div>
  </div>;
}
