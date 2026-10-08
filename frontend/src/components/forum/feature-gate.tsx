'use client';

import { useSetting } from '@/store/settings-store';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface FeatureGateProps {
  /** Setting key, e.g. 'feature_servers_enabled' */
  settingKey: string;
  /** Feature label for the disabled message */
  label: string;
  children: React.ReactNode;
}

/**
 * Wraps a feature page. When the admin disables the feature under
 * Administration → Site settings → Features, the page content is replaced with a
 * "feature disabled" notice.
 */
export default function FeatureGate({ settingKey, label, children }: FeatureGateProps) {
  const enabled = useSetting(settingKey, 'true');
  const { t } = useI18n();

  if (enabled === 'false') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="panel-surface inline-block px-8 py-10">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />
          <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
            {t('featureGate.disabledTitle', { feature: label })}
          </h2>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            {t('featureGate.disabledBody')}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
