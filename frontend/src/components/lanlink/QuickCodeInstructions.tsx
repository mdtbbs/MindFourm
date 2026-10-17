'use client';

import { useI18n } from '@/i18n/provider';

export function QuickCodeInstructions() {
  const { t } = useI18n();
  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold mb-4">{t('lanlink.usageTitle')}</h2>

      <div className="space-y-4 text-sm">
        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.usage1Title')}</h3>
          <p className="text-muted-foreground">
            {t('lanlink.usage1Body')}
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.usage2Title')}</h3>
          <p className="text-muted-foreground">
            {t('lanlink.usage2Body')}
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.usage3Title')}</h3>
          <p className="text-muted-foreground">
            {t('lanlink.usage3Body')}
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.usage4Title')}</h3>
          <p className="text-muted-foreground">
            {t('lanlink.usage4Body')}
          </p>
        </div>
      </div>
    </div>
  );
}
