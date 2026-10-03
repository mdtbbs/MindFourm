'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, RefreshCw } from 'lucide-react';
import { resourceApi, type ResourceAnalytics } from '@/lib/api/client';
import { useI18n } from '@/i18n/provider';

const ranges = [1, 7, 30, 90] as const;
type Range = (typeof ranges)[number];

export default function ResourceAnalyticsPage() {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<Range>(7);
  const [analytics, setAnalytics] = useState<ResourceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setAnalytics(await resourceApi.getAnalytics(range));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const maxDailyViews = Math.max(1, ...(analytics?.daily.map((day) => day.pv) ?? []));
  const metricCards = analytics ? [
    { label: t('resourceAnalytics.pv'), value: number.format(analytics.views.pv), icon: Eye },
    { label: t('resourceAnalytics.uv'), value: number.format(analytics.views.uv) },
    { label: t('resourceAnalytics.downloads'), value: number.format(analytics.downloads) },
    { label: t('resourceAnalytics.conversion'), value: `${number.format(analytics.download_conversion_percent)}%` },
    { label: t('resourceAnalytics.favorites'), value: number.format(analytics.favorites) },
    { label: t('resourceAnalytics.likes'), value: number.format(analytics.likes) },
    { label: t('resourceAnalytics.ratings'), value: number.format(analytics.ratings) },
    { label: t('resourceAnalytics.comments'), value: number.format(analytics.comments) },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900">{t('resourceAnalytics.title')}</h1>
          <p className="mt-1 text-sm text-surface-500">{t('resourceAnalytics.description')}</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t('resourceAnalytics.range')}>
          {ranges.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={range === days}
              onClick={() => setRange(days)}
              className={`min-h-9 border px-3 text-sm ${range === days ? 'border-primary-600 bg-primary-600 text-white' : 'border-surface-200 bg-white text-surface-700 hover:bg-surface-50'}`}
            >
              {t(`resourceAnalytics.range${days}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t('resourceAnalytics.refresh')}
            className="inline-flex h-9 w-9 items-center justify-center border border-surface-200 bg-white text-surface-700 hover:bg-surface-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="inline-flex items-center gap-2"><AlertCircle className="h-4 w-4" />{t('resourceAnalytics.loadError')}</span>
          <button type="button" className="font-medium underline" onClick={() => void load()}>{t('resourceAnalytics.retry')}</button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 border border-surface-200 bg-white sm:grid-cols-4">
        {metricCards.map(({ label, value, icon: Icon }, index) => (
          <div key={label} className={`min-h-24 border-surface-200 px-4 py-4 ${index % 2 ? 'border-l' : ''} ${index > 1 ? 'border-t' : ''} ${index % 4 > 1 ? 'sm:border-l' : ''} ${index >= 4 ? 'sm:border-t' : ''} ${index === 4 || index === 0 ? 'sm:border-l-0' : ''}`}>
            <div className="flex items-center gap-2 text-xs text-surface-500">
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}{label}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-surface-900">{loading && !analytics ? '—' : value}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
        <section className="admin-v2-panel">
          <div className="admin-v2-panel-header">
            <div>
              <div className="admin-v2-panel-title">{t('resourceAnalytics.dailyViews')}</div>
              <div className="admin-v2-panel-subtitle">{t('resourceAnalytics.dailyViewsDescription')}</div>
            </div>
          </div>
          {loading && !analytics ? (
            <div className="space-y-3 px-5 py-5" aria-label={t('resourceAnalytics.loading')}>
              {Array.from({ length: range === 1 ? 1 : 7 }).map((_, index) => <div key={index} className="h-5 animate-pulse bg-surface-100" />)}
            </div>
          ) : analytics?.daily.length ? (
            <div className="max-h-[32rem] space-y-2 overflow-y-auto px-5 py-4">
              {analytics.daily.map((day) => (
                <div key={day.day} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4rem] items-center gap-3 text-xs">
                  <time className="tabular-nums text-surface-500" dateTime={day.day}>{day.day.slice(5)}</time>
                  <div className="h-5 bg-surface-50">
                    <div className="h-full min-w-0 bg-primary-500/75" style={{ width: `${Math.max(day.pv ? 1 : 0, (day.pv / maxDailyViews) * 100)}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-surface-700" title={`${number.format(day.uv)} UV`}>{number.format(day.pv)} PV</span>
                </div>
              ))}
            </div>
          ) : <p className="px-5 py-8 text-sm text-surface-500">{t('resourceAnalytics.noViews')}</p>}
        </section>

        <section className="admin-v2-panel">
          <div className="admin-v2-panel-header">
            <div>
              <div className="admin-v2-panel-title">{t('resourceAnalytics.referrers')}</div>
              <div className="admin-v2-panel-subtitle">{t('resourceAnalytics.referrersDescription')}</div>
            </div>
          </div>
          {analytics?.referrers.length ? (
            <div className="divide-y divide-surface-100">
              {analytics.referrers.map((item) => (
                <div key={item.category} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="text-surface-700">{t(`resourceAnalytics.referrer.${item.category}`)}</span>
                  <span className="tabular-nums text-surface-500">{number.format(item.count)}</span>
                </div>
              ))}
            </div>
          ) : <p className="px-5 py-8 text-sm text-surface-500">{t('resourceAnalytics.noReferrers')}</p>}
        </section>
      </div>
    </div>
  );
}
