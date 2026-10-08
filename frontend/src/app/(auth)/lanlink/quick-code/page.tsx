'use client';

import { useState, useEffect } from 'react';
import { lanlinkApi } from '@/lib/api/client';
import type { QuickCodeStatus as QuickCodeStatusType } from '@/types/lanlink';
import { QuickCodeStatus } from '@/components/lanlink/QuickCodeStatus';
import QuickCodeDisplay from '@/components/lanlink/QuickCodeDisplay';
import { QuickCodeGenerator } from '@/components/lanlink/QuickCodeGenerator';
import { QuickCodeInstructions } from '@/components/lanlink/QuickCodeInstructions';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useI18n } from '@/i18n/provider';
import { isSiteFeatureEnabled } from '@/config/site-profile';

export default function QuickCodePage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<QuickCodeStatusType | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The site profile owns this toggle. Reading NEXT_PUBLIC_LANLINK_ENABLED here
  // made the page disagree with the layout guard and the middleware, which
  // rely on the profile — a correctly configured site could still land on
  // "LanLink is not enabled".
  const isLanLinkEnabled = isSiteFeatureEnabled('lanlink');

  useEffect(() => {
    if (isLanLinkEnabled) {
      void loadStatus();
    } else {
      setLoading(false);
      setError(t('lanlink.quickCodeDisabled'));
    }
    // loadStatus is intentionally not a dependency: it is re-created on each
    // render, and including it would refetch the status on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLanLinkEnabled, t]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const response = await lanlinkApi.getQuickCodeStatus();
      setStatus(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lanlink.quickCodeLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCodeGenerated = (code: string) => {
    setNewCode(code);
    // Refresh the status so the panel reflects the new code.
    void loadStatus();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="card p-6">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button onClick={loadStatus} className="btn btn-primary">
              {t('lanlink.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('lanlink.quickCodeTitle')}</h1>
        <p className="text-muted-foreground">{t('lanlink.quickCodeIntro')}</p>
      </div>

      {/* Newly generated quick code (shown once). */}
      {newCode && (
        <QuickCodeDisplay code={newCode} />
      )}

      {/* Current status. */}
      {status && <QuickCodeStatus status={status} />}

      {/* Generate / reset actions. */}
      <QuickCodeGenerator
        hasExistingCode={status?.has_code || false}
        onCodeGenerated={handleCodeGenerated}
      />

      {/* Instructions. */}
      <QuickCodeInstructions />
    </div>
  );
}
