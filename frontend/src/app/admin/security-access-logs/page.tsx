'use client';

import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import { useI18n } from '@/i18n/provider';
import Button from '@/components/ui/button';

type Entry = {
  id: number; request_id: string; user_id: number | null; method: string; route: string;
  resource_type: string | null; resource_id: string | null; ip_address: string | null;
  user_agent: string | null; status_code: number; created_at: string;
};

type Filters = { request_id: string; user_id: string; ip_address: string; route: string; resource_id: string; status_code: string; from: string; to: string };
const EMPTY_FILTERS: Filters = { request_id: '', user_id: '', ip_address: '', route: '', resource_id: '', status_code: '', from: '', to: '' };

export default function SecurityAccessLogsPage() {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim() !== '')) as Partial<Filters>;
    adminApi.getSecurityAccessLogs({
      page, limit: 50,
      request_id: params.request_id,
      user_id: params.user_id ? Number(params.user_id) : undefined,
      ip_address: params.ip_address,
      route: params.route,
      resource_id: params.resource_id,
      status_code: params.status_code ? Number(params.status_code) : undefined,
      from: params.from,
      to: params.to,
    }).then((result) => {
      if (cancelled) return;
      setEntries(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    }).catch((reason) => {
      if (cancelled) return;
      setEntries([]);
      setError(reason instanceof Error ? reason.message : t('adminSecurityAccessLogs.loadFailed'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, page, t]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));

  return <div className="space-y-5 p-4 sm:p-6">
    <header>
      <h1 className="text-2xl font-semibold text-[var(--text)]">{t('adminSecurityAccessLogs.title')}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t('adminSecurityAccessLogs.retention')}</p>
    </header>

    <form onSubmit={submit} className="grid grid-cols-1 gap-3 border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:grid-cols-2 xl:grid-cols-4">
      {(['request_id', 'user_id', 'ip_address', 'route', 'resource_id', 'status_code', 'from', 'to'] as const).map((key) => <label key={key} className="block min-w-0 text-sm">
        <span className="mb-1 block text-[var(--text-secondary)]">{t(`adminSecurityAccessLogs.filter.${key}`)}</span>
        <input
          value={draft[key]}
          onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.value }))}
          type={key === 'from' || key === 'to' ? 'date' : 'text'}
          inputMode={key === 'user_id' || key === 'status_code' ? 'numeric' : undefined}
          className="h-9 w-full border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
        />
      </label>)}
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
        <Button className="rounded-none" type="submit">{t('adminSecurityAccessLogs.search')}</Button>
        <Button className="rounded-none" type="button" variant="outline" onClick={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); }}>{t('adminSecurityAccessLogs.clear')}</Button>
        <span className="ml-auto text-sm text-[var(--text-muted)]">{t('adminSecurityAccessLogs.total', { count: new Intl.NumberFormat(locale).format(total) })}</span>
      </div>
    </form>

    {error && <p role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="overflow-x-auto border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
        <thead className="bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)]">
          <tr>{['time', 'status', 'method', 'route', 'resource', 'user', 'ip', 'request', 'agent'].map((key) => <th key={key} className="border-b border-[var(--border)] px-3 py-2 font-medium">{t(`adminSecurityAccessLogs.column.${key}`)}</th>)}</tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={9} className="px-3 py-8 text-center text-[var(--text-muted)]">{t('adminSecurityAccessLogs.loading')}</td></tr>}
          {!loading && entries.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-[var(--text-muted)]">{t('adminSecurityAccessLogs.empty')}</td></tr>}
          {!loading && entries.map((entry) => <tr key={entry.id} className="border-b border-[var(--border)] align-top last:border-0">
            <td className="whitespace-nowrap px-3 py-2 text-[var(--text-secondary)]">{formatDate(entry.created_at)}</td>
            <td className={`px-3 py-2 font-mono ${entry.status_code >= 400 ? 'text-red-600' : 'text-[var(--text)]'}`}>{entry.status_code}</td>
            <td className="px-3 py-2 font-mono">{entry.method}</td>
            <td className="max-w-xs break-all px-3 py-2 font-mono text-[var(--text-secondary)]">{entry.route}</td>
            <td className="px-3 py-2">{entry.resource_type && <span>{entry.resource_type}: </span>}{entry.resource_id || '—'}</td>
            <td className="px-3 py-2">{entry.user_id ?? '—'}</td>
            <td className="px-3 py-2 font-mono">{entry.ip_address || '—'}</td>
            <td className="max-w-[180px] break-all px-3 py-2 font-mono text-xs">{entry.request_id}</td>
            <td className="max-w-[240px] break-all px-3 py-2 text-xs text-[var(--text-muted)]">{entry.user_agent || '—'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="flex items-center justify-center gap-3 text-sm">
      <Button className="rounded-none" type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>{t('adminSecurityAccessLogs.previous')}</Button>
      <span className="text-[var(--text-muted)]">{t('adminSecurityAccessLogs.page', { page, total: totalPages })}</span>
      <Button className="rounded-none" type="button" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>{t('adminSecurityAccessLogs.next')}</Button>
    </div>
  </div>;
}
