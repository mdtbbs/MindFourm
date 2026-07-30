'use client';

import { useState, useEffect } from 'react';
import { lanlinkApi } from '@/lib/api/client';
import type { QuickCodeStatus as QuickCodeStatusType } from '@/types/lanlink';
import { QuickCodeStatus } from '@/components/lanlink/QuickCodeStatus';
import QuickCodeDisplay from '@/components/lanlink/QuickCodeDisplay';
import { QuickCodeGenerator } from '@/components/lanlink/QuickCodeGenerator';
import { QuickCodeInstructions } from '@/components/lanlink/QuickCodeInstructions';
import LoadingSpinner from '@/components/ui/loading-spinner';

export default function QuickCodePage() {
  const [status, setStatus] = useState<QuickCodeStatusType | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if LanLink feature is enabled
  const isLanLinkEnabled = process.env.NEXT_PUBLIC_LANLINK_ENABLED === 'true';

  useEffect(() => {
    if (isLanLinkEnabled) {
      loadStatus();
    } else {
      setLoading(false);
      setError('LanLink 功能未启用');
    }
  }, [isLanLinkEnabled]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const response = await lanlinkApi.getQuickCodeStatus();
      setStatus(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeGenerated = (code: string) => {
    setNewCode(code);
    // 重新加载状态
    loadStatus();
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
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">LanLink 快速码</h1>
        <p className="text-muted-foreground">
          管理你的快速码，用于在 Mindustry 游戏中连接到论坛服务器。
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
