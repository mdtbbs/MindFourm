'use client';

import { useSetting } from '@/store/settings-store';
import { AlertCircle } from 'lucide-react';

interface FeatureGateProps {
  /** Setting key, e.g. 'feature_servers_enabled' */
  settingKey: string;
  /** Feature label for the disabled message */
  label: string;
  children: React.ReactNode;
}

/**
 * Wraps a feature page. When the admin disables the feature in
 * 后台 → 站点设置 → 功能管理, the page content is replaced with
 * a "feature disabled" notice.
 */
export default function FeatureGate({ settingKey, label, children }: FeatureGateProps) {
  const enabled = useSetting(settingKey, 'true');

  if (enabled === 'false') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="panel-surface inline-block px-8 py-10">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />
          <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
            {label}已关闭
          </h2>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            管理员已关闭此功能，如需开启请联系管理员。
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
