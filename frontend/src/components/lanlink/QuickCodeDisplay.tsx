'use client';

import { useState } from 'react';
import Alert from '@/components/ui/alert';

interface QuickCodeDisplayProps {
  code: string;
}

export default function QuickCodeDisplay({ code }: QuickCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="card p-6">
      <Alert
        type="warning"
        message="⚠️ 请立即复制并保存此快速码。刷新页面后将无法再次查看！"
        className="mb-4"
      />

      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-2">
            你的快速码：
          </label>
          <div className="flex items-center gap-3">
            <code className="flex-1 px-4 py-3 bg-surface-100 rounded-lg text-lg font-mono font-bold tracking-wider">
              {code}
            </code>
            <button
              onClick={handleCopy}
              className="btn btn-primary px-4"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {copied && (
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ 已复制到剪贴板
          </p>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            在 Mindustry 游戏中使用此快速码连接服务器。
          </p>
        </div>
      </div>
    </div>
  );
}
