'use client';

import { useState } from 'react';
import { lanlinkApi } from '@/lib/api/client';
import type { QuickCodeGenerateResponse, QuickCodeResetResponse } from '@/types/lanlink';
import Alert from '@/components/ui/alert';

interface Props {
  hasExistingCode: boolean;
  onCodeGenerated: (code: string) => void;
}

export function QuickCodeGenerator({ hasExistingCode, onCodeGenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await lanlinkApi.generateQuickCode();
      onCodeGenerated(response.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成快速码失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      '确定要重置快速码吗？\n\n旧快速码将立即失效，新代码生成后旧代码无法再使用。'
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const response = await lanlinkApi.resetQuickCode();
      onCodeGenerated(response.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置快速码失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold mb-4">
        {hasExistingCode ? '重置快速码' : '生成快速码'}
      </h2>

      {error && (
        <Alert type="error" message={error} className="mb-4" />
      )}

      {!hasExistingCode ? (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            生成快速码后，你可以在 Mindustry 游戏中使用它连接服务器。
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? '生成中...' : '生成快速码'}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            重置后旧快速码将立即失效，你需要使用新的快速码。
          </p>
          <button
            onClick={handleReset}
            disabled={loading}
            className="btn btn-danger"
          >
            {loading ? '重置中...' : '重置快速码'}
          </button>
        </div>
      )}
    </div>
  );
}
