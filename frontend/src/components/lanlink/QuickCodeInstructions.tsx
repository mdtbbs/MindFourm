'use client';

import { useI18n } from '@/i18n/provider';

export function QuickCodeInstructions() {
  const { t } = useI18n();

  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold mb-4">{t('lanlink.instructions')}</h2>

      <div className="space-y-4 text-sm">
        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.step1Title')}</h3>
          <p className="text-muted-foreground">
          {t('lanlink.step1Body')}
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.step2Title')}</h3>
          <p className="text-muted-foreground">
          {t('lanlink.step2Body')}
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.step3Title')}</h3>
          <p className="text-muted-foreground">
          {t('lanlink.step3Body')}
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">{t('lanlink.step4Title')}</h3>
          <p className="text-muted-foreground">
          {t('lanlink.step4Body')}
          </p>
        </div>
      </div>
    </div>
  );
}
