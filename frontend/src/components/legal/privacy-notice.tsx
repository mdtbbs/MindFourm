'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Bump this whenever the wording or linked legal documents materially change.
// This only remembers that the notice was dismissed; it is deliberately not a
// substitute for a consent record.
const NOTICE_VERSION = '2026-08-15';
const DISMISSED_KEY = `privacy_notice_dismissed_${NOTICE_VERSION}`;

export default function PrivacyNotice() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    setReady(true);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  if (!ready || dismissed) return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-100">
      <div className="mx-auto flex max-w-7xl items-start gap-3 text-sm">
        <p className="min-w-0 flex-1 leading-6">
          我们会按照{' '}
          <Link href="/privacy" className="font-medium underline underline-offset-2 hover:opacity-80">
            隐私政策
          </Link>
          {' '}处理必要信息。继续使用本站表示你已阅读{' '}
          <Link href="/terms" className="font-medium underline underline-offset-2 hover:opacity-80">
            服务条款
          </Link>
          ；需要单独同意的处理会在使用相应功能时另行说明。不同意相关处理或希望注销、删除资料，请按隐私政策联系管理员。
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          // 44px on touch, 32px on pointer: the previous `p-1` + 16px icon gave a
          // 24px target, well under the accessible minimum.
          className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-[var(--primary-text)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:h-8 sm:w-8"
          aria-label="关闭隐私与服务提示"
          title="关闭"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
