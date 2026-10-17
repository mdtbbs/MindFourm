'use client';

import { Resource } from '@/types';
import { Package, Download, Calendar, HardDrive } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface ResourceVersionsProps {
  resource: Resource;
}

export default function ResourceVersions({ resource }: ResourceVersionsProps) {
  const { locale, t } = useI18n();
  const versions = resource.versions || [];

  if (versions.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
        <p className="text-center text-[var(--text-muted)]">{t('resourceVersions.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
        <Package className="w-5 h-5" />
        {t('resourceVersions.title', { count: versions.length })}
      </h2>
      <div className="space-y-3">
        {versions.map((version, index) => (
          <div
            key={version.id}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-bold text-[var(--text)]">
                    {version.version}
                  </h3>
                  {index === 0 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--primary-soft)] text-[var(--primary-text)]">
                      {t('resourceVersions.latest')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(version.created_at).toLocaleDateString(({ en: 'en', ru: 'ru', ja: 'ja-JP', 'zh-CN': 'zh-CN' } as const)[locale])}
                  </span>
                  {version.file_size && (
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-4 h-4" />
                      {(version.file_size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  )}
                </div>
              </div>
              <button className="px-4 py-2 bg-[var(--primary-button)] hover:bg-[var(--primary-dark)] text-white rounded-lg font-medium flex items-center gap-2 transition-colors">
                <Download className="w-4 h-4" />
                {t('resourceVersions.download')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
