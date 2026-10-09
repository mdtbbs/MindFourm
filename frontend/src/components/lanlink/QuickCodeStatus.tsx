'use client';

import Badge from '@/components/ui/badge';
import type { QuickCodeStatus } from '@/types/lanlink';
import { useI18n } from '@/i18n/provider';

interface Props {
  status: QuickCodeStatus;
}

export function QuickCodeStatus({ status }: Props) {
  const { locale, t } = useI18n();
  const formatDate = (dateString?: string) => {
    if (!dateString) return t('lanlink.neverUsed');
    return new Date(dateString).toLocaleString(({ en: 'en', ru: 'ru', ja: 'ja-JP', 'zh-CN': 'zh-CN' } as const)[locale], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold mb-4">{t('lanlink.statusTitle')}</h2>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t('lanlink.statusLabel')}</span>
          {status.has_code ? (
            <Badge variant="success">{t('lanlink.generated')}</Badge>
          ) : (
            <Badge variant="default">{t('lanlink.notGenerated')}</Badge>
          )}
        </div>

        {status.has_code && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{t('lanlink.createdAt')}</span>
              <span className="text-sm">{formatDate(status.created_at)}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{t('lanlink.lastUsed')}</span>
              <span className="text-sm">{formatDate(status.last_used_at)}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{t('lanlink.useCount')}</span>
              <span className="text-sm">{t('lanlink.useCountValue', { count: status.use_count ?? 0 })}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
