'use client';

import { useState } from 'react';
import Alert from '@/components/ui/alert';
import { useI18n } from '@/i18n/provider';

interface QuickCodeDisplayProps {
  code: string;
}

export default function QuickCodeDisplay({ code }: QuickCodeDisplayProps) {
  const { t } = useI18n();
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
        message={t('lanlink.codeWarning')}
        className="mb-4"
      />

      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-2">
            {t('lanlink.yourCode')}
          </label>
          <div className="flex items-center gap-3">
            <code className="flex-1 px-4 py-3 bg-surface-100 rounded-lg text-lg font-mono font-bold tracking-wider">
              {code}
            </code>
            <button
              onClick={handleCopy}
              className="btn btn-primary px-4"
            >
              {copied ? t('lanlink.copied') : t('lanlink.copy')}
            </button>
          </div>
        </div>

        {copied && (
          <p className="text-sm text-green-600 dark:text-green-400">
            {t('lanlink.copiedToClipboard')}
          </p>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {t('lanlink.useInGame')}
          </p>
        </div>
      </div>
    </div>
  );
}
