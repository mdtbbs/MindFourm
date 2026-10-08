'use client';

import { useState, useEffect, useCallback } from 'react';
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

  // The site profile is the authoritative switch (the layout and middleware use
  // the same one). NEXT_PUBLIC_LANLINK_ENABLED is not set by every deployment,
  // so it must not gate this page on its own.
  const isLanLinkEnabled = isSiteFeatureEnabled('lanlink');

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await lanlinkApi.getQuickCodeStatus();
      setStatus(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lanlink.statusLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isLanLinkEnabled) {
      void loadStatus();
    } else {
      setLoading(false);
      setError(t('lanlink.featureDisabled'));
    }
  }, [isLanLinkEnabled, loadStatus, t]);

  const handleCodeGenerated = (code: string) => {
    setNewCode(code);
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
              {t('common.retry')}
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
        <p className="text-muted-foreground">
          {t('lanlink.quickCodeDescription')}
        </p>
      </div>

      {/* 新生成的快速码显示（一次性） */}
      {newCode && (
        <QuickCodeDisplay code={newCode} />
      )}

      {/* 当前状态 */}
      {status && <QuickCodeStatus status={status} />}

      {/* 生成/重置按钮 */}
      <QuickCodeGenerator
        hasExistingCode={status?.has_code || false}
        onCodeGenerated={handleCodeGenerated}
      />

      {/* 使用说明 */}
      <QuickCodeInstructions />
    </div>
  );
}
