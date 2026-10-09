'use client';

import { Clipboard, ShieldCheck, Star } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceFileSummary } from '@/lib/resources/presentation';
import { useI18n } from '@/i18n/provider';
import { ResourcePrimaryAction } from './resource-actions';

function Stars({ value, interactive = false, onChange, t, locale }: { value: number; interactive?: boolean; onChange?: (value: number) => void; t: (key: string, values?: Record<string, string | number>) => string; locale: string }) {
  return <div className="flex items-center gap-0.5" aria-label={t('resourceAside.score', { score: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value) })}>
    {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" disabled={!interactive} onClick={() => onChange?.(star)} className={interactive ? 'cursor-pointer' : 'cursor-default'} aria-label={t('resourceAside.stars', { count: star })}><Star className={`h-4 w-4 ${star <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-[var(--border)]'}`} /></button>)}
  </div>;
}

export default function ResourceAside({
  resource, supportedVersions, compatibility, hideVersionSupport = false, isAuthenticated, userRating, checksum, onRate, onCopyChecksum,
  isMap = false, downloadUrl, downloadLabel, primaryVersionId,
}: {
  resource: Resource; supportedVersions: string[]; compatibility: string[]; isAuthenticated: boolean;
  hideVersionSupport?: boolean;
  userRating: number | null; checksum: string | null; onRate: (value: number) => void; onCopyChecksum: (value: string) => void;
  isMap?: boolean; downloadUrl?: string; downloadLabel?: string; primaryVersionId?: number;
}) {
  const { t, locale } = useI18n();
  const latestVersion = resource.versions?.[0];
  return <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
    {isMap && downloadUrl && downloadLabel && <ResourcePrimaryAction resource={resource} downloadUrl={downloadUrl} downloadLabel={downloadLabel} primaryVersionId={primaryVersionId} className="w-full" />}
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><ShieldCheck className="h-4 w-4 text-emerald-600" />{t('resourceAside.compatibility')}</h2><div className="mt-4 space-y-4 text-sm">{!hideVersionSupport && <div><h3 className="mb-2 text-[var(--text-muted)]">{t('resourceAside.supportedVersions')}</h3><div className="flex flex-wrap gap-2">{supportedVersions.length ? supportedVersions.map((version) => <span key={version} className="rounded bg-[var(--bg-elevated)] px-2.5 py-1 text-[var(--text-secondary)]">{version}</span>) : <span className="text-[var(--text-muted)]">{t('resourceAside.notSpecified')}</span>}</div></div>}<div><h3 className="mb-2 text-[var(--text-muted)]">{t('resourceAside.platforms')}</h3><div className="flex flex-wrap gap-2">{compatibility.length ? compatibility.map((platform) => <span key={platform} className="rounded bg-emerald-500/10 px-2.5 py-1 text-emerald-700">{platform}</span>) : <span className="text-[var(--text-muted)]">{t('resourceAside.notSpecified')}</span>}</div></div></div></section>
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><Star className="h-4 w-4 text-amber-400" />{t('resourceAside.rating')}</h2>{(resource.rating_count || 0) > 0 ? <div className="mt-4 flex items-center gap-3"><span className="text-3xl font-bold text-[var(--text)]">{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(resource.rating_average || 0)}</span><div><Stars value={resource.rating_average || 0} t={t} locale={locale} /><p className="mt-1 text-xs text-[var(--text-muted)]">{t('resourceAside.ratingCount', { count: new Intl.NumberFormat(locale).format(resource.rating_count || 0) })}</p></div></div> : <div className="mt-4"><Stars value={0} t={t} locale={locale} /><p className="mt-2 text-sm font-medium text-[var(--text)]">{t('resourceAside.noRating')}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{t('resourceAside.firstRating')}</p></div>}{isAuthenticated && <div className="mt-4 border-t border-[var(--border)] pt-4"><p className="mb-2 text-sm text-[var(--text-muted)]">{t('resourceAside.ratePrompt')}</p><Stars value={userRating || 0} interactive onChange={onRate} t={t} locale={locale} /></div>}</section>
    <section className="rounded-md border border-[var(--border)] p-4"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><Clipboard className="h-4 w-4" />{t('resourceAside.fileInfo')}</h2><p className="mt-3 break-words text-sm text-[var(--text-secondary)]">{resourceFileSummary(resource).join(' · ')}</p><p className="mt-1 break-all text-xs text-[var(--text-muted)]">{latestVersion?.file_name || resource.file_name || t('resourceAside.externalLink')}</p><details className="mt-3 border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-xs text-[var(--text-muted)]">{t('resourceAside.advanced')}</summary><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">{t('resourceAside.mime')}</dt><dd className="break-all text-right text-[var(--text-secondary)]">{resource.mime_type || latestVersion?.mime_type || t('resourceAside.notProvided')}</dd></div>{checksum && <div className="space-y-1"><dt className="text-[var(--text-muted)]">{t('resourceAside.checksum')}</dt><dd><button type="button" onClick={() => onCopyChecksum(checksum)} className="block w-full break-all rounded bg-[var(--bg-elevated)] p-2 text-left font-mono text-[11px] text-[var(--text)] hover:text-[var(--primary-text)]">{checksum}</button></dd></div>}</dl></details></section>
  </aside>;
}
