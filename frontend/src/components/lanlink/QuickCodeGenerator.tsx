'use client';

import { useState } from 'react';
import { lanlinkApi } from '@/lib/api/client';
import { confirmDialog } from '@/store/interaction-dialog-store';
import type { QuickCodeGenerateResponse, QuickCodeResetResponse } from '@/types/lanlink';
import Alert from '@/components/ui/alert';
import { useI18n } from '@/i18n/provider';

interface Props {
  hasExistingCode: boolean;
  onCodeGenerated: (code: string) => void;
}

export function QuickCodeGenerator({ hasExistingCode, onCodeGenerated }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await lanlinkApi.generateQuickCode();
      onCodeGenerated(response.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lanlink.generateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await confirmDialog({
      title: t('lanlink.resetConfirmTitle'),
      message: t('lanlink.resetConfirmMessage'),
      confirmLabel: t('lanlink.resetCode'),
      destructive: true,
    });
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const response = await lanlinkApi.resetQuickCode();
      onCodeGenerated(response.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lanlink.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold mb-4">
        {hasExistingCode ? t('lanlink.resetCode') : t('lanlink.generateCode')}
      </h2>

      {error && (
        <Alert type="error" message={error} className="mb-4" />
      )}

      {!hasExistingCode ? (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('lanlink.generateHint')}
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? t('lanlink.generating') : t('lanlink.generateCode')}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('lanlink.resetHint')}
          </p>
          <button
            onClick={handleReset}
            disabled={loading}
            className="btn btn-danger"
          >
            {loading ? t('lanlink.resetting') : t('lanlink.resetCode')}
          </button>
        </div>
      )}
    </div>
  );
}
