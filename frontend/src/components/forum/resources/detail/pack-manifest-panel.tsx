'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Package } from 'lucide-react';
import type { PackVersionManifest, Resource } from '@/types';
import { buildPublicApiUrl, resourceApi } from '@/lib/api/client';
import { useI18n } from '@/i18n/provider';

export default function PackManifestPanel({ resource, selectedVersionPublicId }: { resource: Resource; selectedVersionPublicId?: string }) {
  const { t, locale } = useI18n();
  const packVersion = (selectedVersionPublicId
    ? resource.versions?.find((version) => version.public_id === selectedVersionPublicId)
    : undefined) || resource.versions?.find((version) => version.public_id);
  const packPublicId = resource.public_id;
  const versionPublicId = packVersion?.public_id;
  const [manifest, setManifest] = useState<PackVersionManifest | null>(null);
  const [loading, setLoading] = useState(Boolean(packPublicId && versionPublicId));
  const [failed, setFailed] = useState(false);
  const manifestPath = useMemo(() => packPublicId && versionPublicId
    ? `/api/v1/packs/${encodeURIComponent(packPublicId)}/versions/${encodeURIComponent(versionPublicId)}/manifest`
    : null, [packPublicId, versionPublicId]);

  useEffect(() => {
    if (!packPublicId || !versionPublicId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    resourceApi.getPackManifest(packPublicId, versionPublicId)
      .then((value) => { if (active) setManifest(value); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [packPublicId, versionPublicId]);

  const formatSize = (size: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size);

  return (
    <section className="border-b border-[var(--border)] py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]"><Package className="h-5 w-5 text-[var(--primary-text)]" />{t('packDetails.title')}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('packDetails.description')}</p>
        </div>
        {manifestPath ? (
          <a href={buildPublicApiUrl(manifestPath)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary-text)]">
            <ExternalLink className="h-4 w-4" />{t('packDetails.openManifest')}
          </a>
        ) : null}
      </div>

      {loading ? <p role="status" className="mt-4 text-sm text-[var(--text-muted)]">{t('packDetails.loading')}</p> : null}
      {failed ? <p role="status" className="mt-4 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('packDetails.unavailable')}</p> : null}
      {!loading && !failed && !manifest ? <p className="mt-4 text-sm text-[var(--text-muted)]">{t('packDetails.noPublishedVersion')}</p> : null}

      {manifest ? (
        <>
          <dl className="mt-4 grid gap-3 border-y border-[var(--border)] py-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-[var(--text-muted)]">{t('packDetails.version')}</dt><dd className="mt-1 font-semibold text-[var(--text)]">{manifest.pack.version}</dd></div>
            <div><dt className="text-xs text-[var(--text-muted)]">{t('packDetails.gameVersion')}</dt><dd className="mt-1 font-semibold text-[var(--text)]">{manifest.pack.game_version || t('packDetails.unspecified')}</dd></div>
          </dl>
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">{t('packDetails.members', { count: manifest.members.length })}</h3>
            {manifest.members.length ? (
              <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
                {manifest.members.map((member) => (
                  <li key={`${member.resource_public_id}:${member.version_public_id}`} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[var(--text)]">
                        <span className="truncate">{member.name || member.resource_public_id}</span>
                        <span className="border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">{t(`resourceKinds.${member.resource_kind}`)}</span>
                        <span className="font-mono text-xs text-[var(--text-secondary)]">v{member.version}</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-[var(--text-muted)]">{member.file_name} · {formatSize(member.size_bytes)} {t('packDetails.bytes')}</div>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-[var(--text-muted)]">SHA-256</summary>
                        <code className="mt-1 block break-all font-mono text-[11px] text-[var(--text-secondary)]">{member.sha256}</code>
                      </details>
                    </div>
                    <a href={buildPublicApiUrl(member.download_url)} className="inline-flex min-h-8 items-center justify-center gap-1.5 border border-[var(--border)] px-2.5 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary-text)]">
                      <Download className="h-3.5 w-3.5" />{t('packDetails.downloadFile')}
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="border border-[var(--border)] px-3 py-4 text-sm text-[var(--text-muted)]">{t('packDetails.empty')}</p>}
          </div>
        </>
      ) : null}
    </section>
  );
}
